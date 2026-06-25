import { createHash } from "node:crypto";

import {
  and,
  eq,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import type { getDb } from "../../../db/src/client";
import {
  metaEventOutbox,
  metaWorkerHeartbeat,
  orderLineItems,
  orderMetaAttribution,
  orders,
  products,
} from "../../../db/src/schema";
import { parseNumericAmount } from "../orders-support";
import {
  META_SEMANTICS_VERSION,
  type MetaBrowserEvent,
  type StorefrontOrderMetaResponse,
} from "./meta-contracts";
import { resolveOrderPromo } from "./promos";

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;

export const META_ORDER_CONFIRMED_STATUSES = [2] as const;
export const META_COMPLETED_STATUSES = [4, 10] as const;
export const META_ORDER_CONFIRMED_EVENT_NAME = "orderconfirmed" as const;
export const META_ORDER_COMPLETED_EVENT_NAME = "OrderCompleted" as const;
export const META_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const META_FUTURE_TOLERANCE_MS = 60 * 1000;
const META_ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const META_PROCESSING_LEASE_MS = 2 * 60 * 1000;
const META_MAX_ATTEMPTS = 8;
const META_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export type MetaCommerceLine = {
  productId: number;
  contentId: string;
  rawValue: string;
  title: string;
  originalUnitPrice: number;
  effectiveUnitPrice: number;
  quantity: number;
  discountAmount: number;
  lineTotal: number;
  thumbnailUrl: string | null;
};

export type MetaProductDimension = {
  productId: number;
  productSlug: string | null;
  categoryId: number | null;
  brandId: number | null;
};

export type MetaRequestContext = {
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  externalIdSource?: string | null;
};

type MetaOutboxRow = typeof metaEventOutbox.$inferSelect;

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeText(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeAlgeriaPhone(value: string | null | undefined) {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `213${digits.slice(1)}`;
  if (!digits.startsWith("213") && digits.length === 9) digits = `213${digits}`;
  return /^213\d{8,9}$/.test(digits) ? digits : null;
}

export function hashMetaValue(value: string | null | undefined) {
  const normalized = normalizeText(value);
  return normalized
    ? createHash("sha256").update(normalized).digest("hex")
    : null;
}

function hashAlreadyNormalized(value: string | null) {
  return value ? createHash("sha256").update(value).digest("hex") : null;
}

export function isValidFbc(value: string | null | undefined) {
  return Boolean(value && /^fb\.\d+\.\d+\..+/.test(value.trim()));
}

export function isValidFbp(value: string | null | undefined) {
  return Boolean(value && /^fb\.\d+\.\d+\.\d+/.test(value.trim()));
}

export function buildMetaUserData(input: {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  externalIdSource?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}) {
  const phone = normalizeAlgeriaPhone(input.phone);
  const data: Record<string, string> = {};
  const hashedFields = {
    em: hashMetaValue(input.email),
    fn: hashMetaValue(input.firstName),
    ln: hashMetaValue(input.lastName),
    ph: hashAlreadyNormalized(phone),
    ct: hashMetaValue(input.city),
    st: hashMetaValue(input.state),
    country: hashMetaValue("dz"),
    external_id: hashMetaValue(input.externalIdSource),
  };

  for (const [key, value] of Object.entries(hashedFields)) {
    if (value) data[key] = value;
  }
  if (isValidFbc(input.fbc)) data.fbc = input.fbc!.trim();
  if (isValidFbp(input.fbp)) data.fbp = input.fbp!.trim();
  if (input.clientIpAddress?.trim()) data.client_ip_address = input.clientIpAddress.trim();
  if (input.clientUserAgent?.trim()) data.client_user_agent = input.clientUserAgent.trim();
  return data;
}

export function getMetaMatchKeySummary(userData: Record<string, unknown>) {
  return Object.keys(userData)
    .filter((key) => userData[key] !== null && userData[key] !== undefined && userData[key] !== "")
    .sort();
}

export function getOrderConfirmedEventId(orderId: number) {
  return `order:${orderId}:confirmed:v1`;
}

export function getOrderCompletedEventId(orderId: number) {
  return `order:${orderId}:completed:v1`;
}

export function isMetaOrderConfirmedStatus(status: number) {
  return (META_ORDER_CONFIRMED_STATUSES as readonly number[]).includes(status);
}

export function isMetaCompletedStatus(status: number) {
  return (META_COMPLETED_STATUSES as readonly number[]).includes(status);
}

export function normalizeMetaEventTime(value: Date, now = new Date()) {
  if (value.getTime() < now.getTime() - META_EVENT_MAX_AGE_MS) {
    return { kind: "expired" as const, value };
  }
  if (value.getTime() > now.getTime() + META_FUTURE_TOLERANCE_MS) {
    return { kind: "clamped" as const, value: now };
  }
  return { kind: "valid" as const, value };
}

function buildProductConditions(productIds: number[], mongoIds: string[]) {
  const conditions = [];
  if (productIds.length > 0) conditions.push(inArray(products.id, productIds));
  if (mongoIds.length > 0) conditions.push(inArray(products.mongoId, mongoIds));
  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

export async function resolveMetaCommerceLines(
  db: Executor,
  input: {
    items: Array<{ productId: number; quantity: number }>;
    promoCode?: string | null;
    now?: Date;
  },
) {
  const quantities = new Map<number, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.productId) || item.productId <= 0) continue;
    const quantity = Math.max(1, Math.min(50, Math.trunc(item.quantity)));
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + quantity);
  }
  const productIds = [...quantities.keys()];
  if (productIds.length === 0) return [];

  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      price: products.price,
      images: products.images,
    })
    .from(products)
    .where(and(eq(products.active, true), inArray(products.id, productIds)));

  const expandedCart = productIds.flatMap((productId) =>
    Array.from({ length: quantities.get(productId) ?? 1 }, () => String(productId)));
  const promo = await resolveOrderPromo(db as Database, {
    cartProducts: expandedCart,
    promoCode: input.promoCode,
    now: input.now,
  });

  return rows.map((row): MetaCommerceLine => {
    const quantity = quantities.get(row.id) ?? 1;
    const originalUnitPrice = parseNumericAmount(row.price);
    const originalLineTotal = originalUnitPrice * quantity;
    const discountAmount = promo?.productId === row.id ? promo.discountAmount : 0;
    const lineTotal = roundCurrency(Math.max(0, originalLineTotal - discountAmount));
    return {
      productId: row.id,
      contentId: String(row.id),
      rawValue: String(row.id),
      title: row.title,
      originalUnitPrice,
      effectiveUnitPrice: roundCurrency(lineTotal / quantity),
      quantity,
      discountAmount: roundCurrency(discountAmount),
      lineTotal,
      thumbnailUrl: row.images[0] ?? null,
    };
  }).sort((a, b) => a.productId - b.productId);
}

export async function resolveOrderLineSnapshots(
  db: Executor,
  input: {
    cartProducts: string[];
    promoCode?: string | null;
    now?: Date;
  },
) {
  const numericIds = [...new Set(input.cartProducts
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0))];
  const mongoIds = [...new Set(input.cartProducts
    .map((value) => value.trim())
    .filter((value) => /^[a-f\d]{24}$/i.test(value)))];
  if (numericIds.length === 0 && mongoIds.length === 0) return [];

  const condition = buildProductConditions(numericIds, mongoIds);
  if (!condition) return [];
  const rows = await db
    .select({
      id: products.id,
      mongoId: products.mongoId,
      title: products.title,
      price: products.price,
      images: products.images,
    })
    .from(products)
    .where(condition);
  const rowByReference = new Map<string, typeof rows[number]>();
  for (const row of rows) {
    rowByReference.set(String(row.id), row);
    if (row.mongoId) rowByReference.set(row.mongoId, row);
  }
  const quantities = new Map<number, { row: typeof rows[number]; quantity: number; rawValue: string }>();
  for (const raw of input.cartProducts) {
    const value = raw.trim();
    const row = rowByReference.get(value);
    if (!row) continue;
    const current = quantities.get(row.id);
    quantities.set(row.id, {
      row,
      quantity: (current?.quantity ?? 0) + 1,
      rawValue: current?.rawValue ?? value,
    });
  }
  const promo = await resolveOrderPromo(db as Database, {
    cartProducts: input.cartProducts,
    promoCode: input.promoCode,
    now: input.now,
  });

  return [...quantities.values()].map(({ row, quantity, rawValue }): MetaCommerceLine => {
    const originalUnitPrice = parseNumericAmount(row.price);
    const originalLineTotal = originalUnitPrice * quantity;
    const discountAmount = promo?.productId === row.id ? promo.discountAmount : 0;
    const lineTotal = roundCurrency(Math.max(0, originalLineTotal - discountAmount));
    return {
      productId: row.id,
      contentId: String(row.id),
      rawValue,
      title: row.title,
      originalUnitPrice,
      effectiveUnitPrice: roundCurrency(lineTotal / quantity),
      quantity,
      discountAmount: roundCurrency(discountAmount),
      lineTotal,
      thumbnailUrl: row.images[0] ?? null,
    };
  }).sort((a, b) => a.productId - b.productId);
}

export async function replaceOrderLineSnapshots(
  db: Executor,
  orderId: number,
  lines: MetaCommerceLine[],
  now = new Date(),
) {
  await db.delete(orderLineItems).where(eq(orderLineItems.orderId, orderId));
  if (lines.length === 0) return;
  await db.insert(orderLineItems).values(lines.map((line) => ({
    orderId,
    productId: line.productId,
    contentId: line.contentId,
    rawValue: line.rawValue,
    titleSnapshot: line.title,
    originalUnitPrice: line.originalUnitPrice.toFixed(2),
    effectiveUnitPrice: line.effectiveUnitPrice.toFixed(2),
    quantity: line.quantity,
    discountAmount: line.discountAmount.toFixed(2),
    lineTotal: line.lineTotal.toFixed(2),
    thumbnailUrl: line.thumbnailUrl,
    createdAt: now,
    updatedAt: now,
  })));
}

export async function refreshOrderLineSnapshotsForMutableOrder(
  db: Database,
  input: {
    orderId: number;
    cartProducts: string[];
    promoCode?: string | null;
  },
) {
  const lines = await resolveOrderLineSnapshots(db, {
    cartProducts: input.cartProducts,
    promoCode: input.promoCode,
  });
  await db.transaction(async (tx) => {
    await replaceOrderLineSnapshots(tx, input.orderId, lines);
  });
  return true;
}

export function buildMetaCommerceCustomData(lines: MetaCommerceLine[], orderId?: number) {
  const value = roundCurrency(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  return {
    content_ids: lines.map((line) => line.contentId),
    contents: lines.map((line) => ({
      id: line.contentId,
      quantity: line.quantity,
      item_price: line.effectiveUnitPrice,
    })),
    content_type: "product",
    currency: "DZD",
    value,
    num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
    ...(orderId ? { order_id: String(orderId) } : {}),
  };
}

async function insertMetaOutboxEvent(
  db: Executor,
  input: {
    eventName: string;
    eventId: string;
    source: string;
    orderId?: number | null;
    orderStatusHistoryId?: number | null;
    eventTime: Date;
    eventSourceUrl: string;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
    status?: string;
  },
) {
  const [row] = await db.insert(metaEventOutbox).values({
    eventName: input.eventName,
    eventId: input.eventId,
    source: input.source,
    orderId: input.orderId ?? null,
    orderStatusHistoryId: input.orderStatusHistoryId ?? null,
    eventTime: input.eventTime,
    eventSourceUrl: input.eventSourceUrl,
    userData: input.userData,
    customData: input.customData,
    matchKeySummary: getMetaMatchKeySummary(input.userData),
    status: input.status ?? "pending",
    nextAttemptAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing({
    target: [metaEventOutbox.eventName, metaEventOutbox.eventId],
  }).returning();
  return row ?? null;
}

export async function enqueueMetaBrowserEvent(
  db: Database,
  event: MetaBrowserEvent,
  context: MetaRequestContext,
) {
  const normalizedTime = normalizeMetaEventTime(
    event.occurredAt ? new Date(event.occurredAt) : new Date(),
  );
  const usesCommerceLines = event.eventName !== "PageView" && event.eventName !== "Search";
  const lines = usesCommerceLines
    ? await resolveMetaCommerceLines(db, {
      items: event.items,
      promoCode: event.promoCode,
    })
    : [];
  const userData = buildMetaUserData({
    externalIdSource: context.externalIdSource ?? event.visitId ?? event.journeyId,
    fbc: context.fbc,
    fbp: context.fbp,
    clientIpAddress: context.clientIpAddress,
    clientUserAgent: context.clientUserAgent,
  });
  const customData = event.eventName === "Search"
    ? { search_string: event.searchTerm }
    : event.eventName === "PageView"
      ? {}
      : buildMetaCommerceCustomData(lines);
  let outbox = await insertMetaOutboxEvent(db, {
    eventName: event.eventName,
    eventId: event.eventId,
    source: "browser",
    eventTime: normalizedTime.value,
    eventSourceUrl: event.eventSourceUrl,
    userData,
    customData,
    status: normalizedTime.kind === "expired" ? "skipped" : "pending",
  });
  return {
    outbox,
    deduped: outbox === null,
    skipped: normalizedTime.kind === "expired",
  };
}

export async function createOrderMetaArtifacts(
  tx: Transaction,
  input: {
    order: typeof orders.$inferSelect;
    lines: MetaCommerceLine[];
    eventId: string;
    eventSourceUrl: string;
    requestContext: MetaRequestContext;
    now: Date;
  },
): Promise<StorefrontOrderMetaResponse> {
  await replaceOrderLineSnapshots(tx, input.order.id, input.lines, input.now);
  const externalIdSource = input.requestContext.externalIdSource
    ?? input.order.visitId
    ?? input.order.journeyId
    ?? input.eventId;
  const userData = buildMetaUserData({
    email: input.order.email,
    firstName: input.order.firstName,
    lastName: input.order.lastName,
    phone: input.order.phoneNumber1,
    city: input.order.city,
    state: input.order.state == null ? null : String(input.order.state),
    externalIdSource,
    fbc: input.requestContext.fbc,
    fbp: input.requestContext.fbp,
    clientIpAddress: input.requestContext.clientIpAddress,
    clientUserAgent: input.requestContext.clientUserAgent,
  });
  const customData = buildMetaCommerceCustomData(input.lines, input.order.id);
  const outbox = await insertMetaOutboxEvent(tx, {
    eventName: "Purchase",
    eventId: input.eventId,
    source: "order_submission",
    orderId: input.order.id,
    eventTime: input.now,
    eventSourceUrl: input.eventSourceUrl,
    userData,
    customData,
  });
  await tx.insert(orderMetaAttribution).values({
    orderId: input.order.id,
    semanticsVersion: META_SEMANTICS_VERSION,
    leadEventId: input.eventId,
    eventSourceUrl: input.eventSourceUrl,
    fbc: isValidFbc(input.requestContext.fbc) ? input.requestContext.fbc!.trim() : null,
    fbp: isValidFbp(input.requestContext.fbp) ? input.requestContext.fbp!.trim() : null,
    externalIdSource,
    clientIpAddress: input.requestContext.clientIpAddress ?? null,
    clientUserAgent: input.requestContext.clientUserAgent ?? null,
    leadOutboxId: null,
    purchaseOutboxId: outbox?.id ?? null,
    expiresAt: new Date(input.now.getTime() + META_ATTRIBUTION_TTL_MS),
    createdAt: input.now,
    updatedAt: input.now,
  }).onConflictDoNothing({ target: orderMetaAttribution.orderId });

  return {
    eventName: "Purchase",
    eventId: input.eventId,
    value: Number(customData.value),
    currency: "DZD",
    contents: customData.contents,
  };
}

function getMetaCredentials() {
  const pixelId = process.env.META_PIXEL_ID?.trim()
    || process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID?.trim()
    || "";
  const token = process.env.META_CONVERSIONS_API_TOKEN?.trim()
    || process.env.FACEBOOK_ACCESS_TOKEN?.trim()
    || "";
  const configuredVersion = process.env.META_GRAPH_API_VERSION?.trim() || "v25.0";
  const graphVersion = /^v\d+\.\d+$/.test(configuredVersion)
    ? configuredVersion
    : "v25.0";
  return { pixelId, token, graphVersion };
}

type MetaSendResult =
  | {
    ok: true;
    status: number;
    eventsReceived: number;
    fbtraceId: string | null;
  }
  | {
    ok: false;
    retryable: boolean;
    status: number | null;
    retryAfterMs: number | null;
    code: number | null;
    subcode: number | null;
    message: string;
    fbtraceId: string | null;
  };

function parseRetryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

export async function sendMetaEvent(
  event: Pick<MetaOutboxRow, "eventName" | "eventId" | "eventTime" | "eventSourceUrl" | "userData" | "customData">,
  options?: { testEventCode?: string | null },
): Promise<MetaSendResult> {
  const { pixelId, token, graphVersion } = getMetaCredentials();
  if (!pixelId || !token) {
    return {
      ok: false,
      retryable: true,
      status: null,
      retryAfterMs: null,
      code: null,
      subcode: null,
      message: "Missing Meta pixel credentials.",
      fbtraceId: null,
    };
  }
  const payload = {
    data: [{
      event_name: event.eventName,
      event_time: Math.floor(event.eventTime.getTime() / 1000),
      event_id: event.eventId,
      action_source: "website",
      event_source_url: event.eventSourceUrl,
      user_data: event.userData,
      custom_data: event.customData,
    }],
    ...(options?.testEventCode ? { test_event_code: options.testEventCode } : {}),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(pixelId)}/events`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );
    const body = await response.json().catch(() => ({})) as {
      events_received?: unknown;
      fbtrace_id?: unknown;
      error?: {
        message?: unknown;
        code?: unknown;
        error_subcode?: unknown;
        fbtrace_id?: unknown;
      };
    };
    const eventsReceived = typeof body.events_received === "number" ? body.events_received : 0;
    const fbtraceId = typeof body.fbtrace_id === "string"
      ? body.fbtrace_id
      : typeof body.error?.fbtrace_id === "string"
        ? body.error.fbtrace_id
        : null;
    if (response.ok && eventsReceived >= 1) {
      return { ok: true, status: response.status, eventsReceived, fbtraceId };
    }
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    return {
      ok: false,
      retryable,
      status: response.status,
      retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
      code: typeof body.error?.code === "number" ? body.error.code : null,
      subcode: typeof body.error?.error_subcode === "number" ? body.error.error_subcode : null,
      message: typeof body.error?.message === "string"
        ? body.error.message
        : response.ok
          ? "Meta returned events_received < 1."
          : `Meta API returned HTTP ${response.status}.`,
      fbtraceId,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      status: null,
      retryAfterMs: null,
      code: null,
      subcode: null,
      message: error instanceof Error ? error.message : String(error),
      fbtraceId: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function claimMetaOutboxEvents(db: Database, limit: number) {
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + META_PROCESSING_LEASE_MS);
  const result = await db.execute(sql`
    with candidates as (
      select id
      from ${metaEventOutbox}
      where (
        (${metaEventOutbox.status} in ('pending', 'retryable')
          and ${metaEventOutbox.nextAttemptAt} <= ${now})
        or (${metaEventOutbox.status} = 'processing'
          and ${metaEventOutbox.processingLeaseExpiresAt} < ${now})
      )
      order by ${metaEventOutbox.nextAttemptAt} asc, ${metaEventOutbox.id} asc
      for update skip locked
      limit ${limit}
    )
    update ${metaEventOutbox}
    set
      status = 'processing',
      attempt_count = ${metaEventOutbox.attemptCount} + 1,
      processing_started_at = ${now},
      processing_lease_expires_at = ${leaseExpiresAt},
      last_attempt_at = ${now},
      updated_at = ${now}
    where id in (select id from candidates)
    returning id
  `);
  const ids = (result.rows as Array<{ id: number | string }>).map((row) => Number(row.id));
  if (ids.length === 0) return [];
  return db.select().from(metaEventOutbox).where(inArray(metaEventOutbox.id, ids));
}

function retryDelayMs(attemptCount: number) {
  return META_RETRY_DELAYS_MS[
    Math.min(Math.max(attemptCount - 1, 0), META_RETRY_DELAYS_MS.length - 1)
  ];
}

export async function processMetaOutboxBatch(db: Database, limit = 50) {
  const rows = await claimMetaOutboxEvents(db, Math.max(1, Math.min(limit, 50)));
  let delivered = 0;
  let retryable = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const now = new Date();
    if (row.eventTime.getTime() < now.getTime() - META_EVENT_MAX_AGE_MS) {
      skipped += 1;
      await db.update(metaEventOutbox).set({
        status: "skipped",
        metaErrorMessage: "Event exceeded Meta's seven-day delivery window.",
        processingLeaseExpiresAt: null,
        updatedAt: now,
      }).where(eq(metaEventOutbox.id, row.id));
      continue;
    }
    const result = await sendMetaEvent(row);
    if (result.ok) {
      delivered += 1;
      await db.update(metaEventOutbox).set({
        status: "delivered",
        deliveredAt: now,
        processingLeaseExpiresAt: null,
        lastHttpStatus: result.status,
        fbtraceId: result.fbtraceId,
        eventsReceived: result.eventsReceived,
        userData: {},
        updatedAt: now,
      }).where(eq(metaEventOutbox.id, row.id));
      continue;
    }
    const canRetry = result.retryable
      && row.attemptCount < META_MAX_ATTEMPTS
      && row.eventTime.getTime() + META_EVENT_MAX_AGE_MS > now.getTime();
    if (canRetry) retryable += 1;
    else failed += 1;
    await db.update(metaEventOutbox).set({
      status: canRetry ? "retryable" : "failed",
      nextAttemptAt: canRetry
        ? new Date(now.getTime() + (result.retryAfterMs ?? retryDelayMs(row.attemptCount)))
        : row.nextAttemptAt,
      processingLeaseExpiresAt: null,
      lastHttpStatus: result.status,
      metaErrorCode: result.code,
      metaErrorSubcode: result.subcode,
      metaErrorMessage: result.message.slice(0, 2000),
      fbtraceId: result.fbtraceId,
      updatedAt: now,
    }).where(eq(metaEventOutbox.id, row.id));
  }
  return { claimed: rows.length, delivered, retryable, failed, skipped };
}

function lineRowToCommerceLine(row: typeof orderLineItems.$inferSelect): MetaCommerceLine {
  return {
    productId: row.productId ?? Number(row.contentId),
    contentId: row.contentId,
    rawValue: row.rawValue,
    title: row.titleSnapshot,
    originalUnitPrice: parseNumericAmount(row.originalUnitPrice),
    effectiveUnitPrice: parseNumericAmount(row.effectiveUnitPrice),
    quantity: row.quantity,
    discountAmount: parseNumericAmount(row.discountAmount),
    lineTotal: parseNumericAmount(row.lineTotal),
    thumbnailUrl: row.thumbnailUrl,
  };
}

export function buildPurchaseAnalyticsItems(
  lines: MetaCommerceLine[],
  dimensions: MetaProductDimension[],
) {
  const dimensionByProductId = new Map(
    dimensions.map((dimension) => [dimension.productId, dimension]),
  );
  return lines.map((line) => {
    const dimension = dimensionByProductId.get(line.productId);
    return {
      productId: line.productId,
      productSlug: dimension?.productSlug ?? null,
      categoryId: dimension?.categoryId ?? null,
      brandId: dimension?.brandId ?? null,
      quantity: line.quantity,
      price: line.effectiveUnitPrice,
    };
  });
}

export async function ensureOrderConfirmedEventForOrder(
  db: Database,
  input: {
    orderId: number;
    statusHistoryId: number;
    status: number;
    changedAt: Date;
  },
) {
  if (!isMetaOrderConfirmedStatus(input.status)) {
    return { created: false, reason: "unqualified" as const };
  }
  const [attribution] = await db.select().from(orderMetaAttribution)
    .where(and(
      eq(orderMetaAttribution.orderId, input.orderId),
      eq(orderMetaAttribution.semanticsVersion, META_SEMANTICS_VERSION),
    )).limit(1);
  if (!attribution) return { created: false, reason: "legacy" as const };
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) return { created: false, reason: "missing_order" as const };

  const eventId = getOrderConfirmedEventId(input.orderId);
  const [existingConfirmation] = await db.select({
    id: metaEventOutbox.id,
  }).from(metaEventOutbox).where(and(
    eq(metaEventOutbox.eventName, META_ORDER_CONFIRMED_EVENT_NAME),
    eq(metaEventOutbox.eventId, eventId),
  )).limit(1);
  if (existingConfirmation) {
    return {
      created: false,
      reason: "deduped" as const,
      outboxId: existingConfirmation.id,
      eventId,
    };
  }

  const currentLines = await resolveOrderLineSnapshots(db, {
    cartProducts: order.cartProducts,
    promoCode: order.promoCode,
  });
  await db.transaction(async (tx) => {
    await replaceOrderLineSnapshots(tx, order.id, currentLines);
  });
  const lineRows = await db.select().from(orderLineItems)
    .where(eq(orderLineItems.orderId, input.orderId));
  const lines = lineRows.map(lineRowToCommerceLine).filter((line) => Number.isInteger(line.productId));
  if (lines.length === 0) return { created: false, reason: "missing_lines" as const };

  const normalizedTime = normalizeMetaEventTime(input.changedAt);
  const userData = buildMetaUserData({
    email: order.email,
    firstName: order.firstName,
    lastName: order.lastName,
    phone: order.phoneNumber1,
    city: order.city,
    state: order.state == null ? null : String(order.state),
    externalIdSource: attribution.externalIdSource,
    fbc: attribution.fbc,
    fbp: attribution.fbp,
    clientIpAddress: attribution.clientIpAddress,
    clientUserAgent: attribution.clientUserAgent,
  });
  const customData = {
    ...buildMetaCommerceCustomData(lines, order.id),
    order_status: input.status,
  };
  const outbox = await insertMetaOutboxEvent(db, {
    eventName: META_ORDER_CONFIRMED_EVENT_NAME,
    eventId,
    source: "order_confirmation",
    orderId: order.id,
    orderStatusHistoryId: input.statusHistoryId,
    eventTime: normalizedTime.value,
    eventSourceUrl: attribution.eventSourceUrl,
    userData,
    customData,
    status: normalizedTime.kind === "expired" ? "skipped" : "pending",
  });
  if (!outbox) {
    return {
      created: false,
      reason: "deduped" as const,
      eventId,
    };
  }
  return { created: true, outboxId: outbox.id, eventId };
}

export async function ensureOrderCompletedEventForOrder(
  db: Database,
  input: {
    orderId: number;
    statusHistoryId: number;
    status: number;
    changedAt: Date;
  },
) {
  if (!isMetaCompletedStatus(input.status)) {
    return { created: false, reason: "unqualified" as const };
  }
  const [attribution] = await db.select().from(orderMetaAttribution)
    .where(and(
      eq(orderMetaAttribution.orderId, input.orderId),
      eq(orderMetaAttribution.semanticsVersion, META_SEMANTICS_VERSION),
    )).limit(1);
  if (!attribution) return { created: false, reason: "legacy" as const };
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) return { created: false, reason: "missing_order" as const };

  const eventId = getOrderCompletedEventId(input.orderId);
  const [existingCompletion] = await db.select({
    id: metaEventOutbox.id,
  }).from(metaEventOutbox).where(and(
    eq(metaEventOutbox.eventName, META_ORDER_COMPLETED_EVENT_NAME),
    eq(metaEventOutbox.eventId, eventId),
  )).limit(1);
  if (existingCompletion) {
    return {
      created: false,
      reason: "deduped" as const,
      outboxId: existingCompletion.id,
      eventId,
    };
  }

  let lineRows = await db.select().from(orderLineItems)
    .where(eq(orderLineItems.orderId, input.orderId));
  if (lineRows.length === 0) {
    const currentLines = await resolveOrderLineSnapshots(db, {
      cartProducts: order.cartProducts,
      promoCode: order.promoCode,
    });
    await db.transaction(async (tx) => {
      await replaceOrderLineSnapshots(tx, order.id, currentLines);
    });
    lineRows = await db.select().from(orderLineItems)
      .where(eq(orderLineItems.orderId, input.orderId));
  }
  const lines = lineRows.map(lineRowToCommerceLine).filter((line) => Number.isInteger(line.productId));
  if (lines.length === 0) return { created: false, reason: "missing_lines" as const };

  const normalizedTime = normalizeMetaEventTime(input.changedAt);
  const userData = buildMetaUserData({
    email: order.email,
    firstName: order.firstName,
    lastName: order.lastName,
    phone: order.phoneNumber1,
    city: order.city,
    state: order.state == null ? null : String(order.state),
    externalIdSource: attribution.externalIdSource,
    fbc: attribution.fbc,
    fbp: attribution.fbp,
    clientIpAddress: attribution.clientIpAddress,
    clientUserAgent: attribution.clientUserAgent,
  });
  const customData = {
    ...buildMetaCommerceCustomData(lines, order.id),
    order_status: input.status,
  };
  const outbox = await insertMetaOutboxEvent(db, {
    eventName: META_ORDER_COMPLETED_EVENT_NAME,
    eventId,
    source: "order_completion",
    orderId: order.id,
    orderStatusHistoryId: input.statusHistoryId,
    eventTime: normalizedTime.value,
    eventSourceUrl: attribution.eventSourceUrl,
    userData,
    customData,
    status: normalizedTime.kind === "expired" ? "skipped" : "pending",
  });
  if (!outbox) {
    return {
      created: false,
      reason: "deduped" as const,
      eventId,
    };
  }
  return { created: true, outboxId: outbox.id, eventId };
}

export async function reconcileOrderConfirmedEvents(db: Database, limit = 100) {
  const result = await db.execute(sql`
    select distinct on (history.order_id)
      history.id as history_id,
      history.order_id,
      history.status,
      history.changed_at
    from order_status_history history
    inner join order_meta_attribution attribution
      on attribution.order_id = history.order_id
      and attribution.semantics_version = ${META_SEMANTICS_VERSION}
    where history.status in (2)
      and not exists (
        select 1
        from meta_event_outbox outbox
        where outbox.order_id = history.order_id
          and outbox.event_name = ${META_ORDER_CONFIRMED_EVENT_NAME}
      )
    order by history.order_id asc, history.changed_at asc, history.id asc
    limit ${Math.max(1, Math.min(limit, 500))}
  `);
  const rows = result.rows as Array<{
    history_id: number | string;
    order_id: number | string;
    status: number;
    changed_at: Date | string;
  }>;
  let created = 0;
  for (const row of rows) {
    const outcome = await ensureOrderConfirmedEventForOrder(db, {
      orderId: Number(row.order_id),
      statusHistoryId: Number(row.history_id),
      status: Number(row.status),
      changedAt: row.changed_at instanceof Date ? row.changed_at : new Date(row.changed_at),
    });
    if (outcome.created) created += 1;
  }
  return { confirmationScanned: rows.length, confirmationCreated: created };
}

export async function reconcileOrderCompletedEvents(db: Database, limit = 100) {
  const result = await db.execute(sql`
    select distinct on (history.order_id)
      history.id as history_id,
      history.order_id,
      history.status,
      history.changed_at
    from order_status_history history
    inner join order_meta_attribution attribution
      on attribution.order_id = history.order_id
      and attribution.semantics_version = ${META_SEMANTICS_VERSION}
    where history.status in (4, 10)
      and not exists (
        select 1
        from meta_event_outbox outbox
        where outbox.order_id = history.order_id
          and outbox.event_name = ${META_ORDER_COMPLETED_EVENT_NAME}
      )
    order by history.order_id asc, history.changed_at asc, history.id asc
    limit ${Math.max(1, Math.min(limit, 500))}
  `);
  const rows = result.rows as Array<{
    history_id: number | string;
    order_id: number | string;
    status: number;
    changed_at: Date | string;
  }>;
  let created = 0;
  for (const row of rows) {
    const outcome = await ensureOrderCompletedEventForOrder(db, {
      orderId: Number(row.order_id),
      statusHistoryId: Number(row.history_id),
      status: Number(row.status),
      changedAt: row.changed_at instanceof Date ? row.changed_at : new Date(row.changed_at),
    });
    if (outcome.created) created += 1;
  }
  return { completionScanned: rows.length, completionCreated: created };
}

export async function clearExpiredMetaAttribution(db: Database) {
  const now = new Date();
  const result = await db.update(orderMetaAttribution).set({
    fbc: null,
    fbp: null,
    externalIdSource: null,
    clientIpAddress: null,
    clientUserAgent: null,
    updatedAt: now,
  }).where(sql`${orderMetaAttribution.expiresAt} <= ${now}
    and (
      ${orderMetaAttribution.externalIdSource} is not null
      or ${orderMetaAttribution.fbc} is not null
      or ${orderMetaAttribution.fbp} is not null
      or ${orderMetaAttribution.clientIpAddress} is not null
      or ${orderMetaAttribution.clientUserAgent} is not null
    )`).returning({ orderId: orderMetaAttribution.orderId });
  return { cleared: result.length };
}

export async function updateMetaWorkerHeartbeat(
  db: Database,
  input: {
    successfulDrain?: boolean;
    reconciliationResult?: Record<string, unknown>;
  } = {},
) {
  const now = new Date();
  const workerKey = "storefront-meta-worker";
  await db.insert(metaWorkerHeartbeat).values({
    workerKey,
    release: process.env.SENTRY_RELEASE?.trim() || null,
    lastHeartbeatAt: now,
    lastSuccessfulDrainAt: input.successfulDrain ? now : null,
    lastReconciliationAt: input.reconciliationResult ? now : null,
    lastReconciliationResult: input.reconciliationResult ?? {},
    updatedAt: now,
  }).onConflictDoUpdate({
    target: metaWorkerHeartbeat.workerKey,
    set: {
      release: process.env.SENTRY_RELEASE?.trim() || null,
      lastHeartbeatAt: now,
      ...(input.successfulDrain ? { lastSuccessfulDrainAt: now } : {}),
      ...(input.reconciliationResult
        ? {
          lastReconciliationAt: now,
          lastReconciliationResult: input.reconciliationResult,
        }
        : {}),
      updatedAt: now,
    },
  });
}
