import { and, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";

import type { getDb } from "../../../db/src/client";
import {
  analyticsEvents,
  analyticsJourneys,
  analyticsPaidClickVisits,
  brands,
  categories,
  orders,
  products,
} from "../../../db/src/schema";

type Database = ReturnType<typeof getDb>;

const nullableTrimmedString = (max: number) =>
  z.union([z.string(), z.null(), z.undefined()]).transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed.slice(0, max);
  });

const nullablePositiveInt = z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
});

const nullablePositiveNumber = z.union([z.number(), z.string(), z.null(), z.undefined()]).transform((value) => {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
});

const analyticsItemSchema = z.object({
  productId: nullablePositiveInt,
  productSlug: nullableTrimmedString(180),
  categoryId: nullablePositiveInt,
  categorySlug: nullableTrimmedString(180),
  brandId: nullablePositiveInt,
  brandSlug: nullableTrimmedString(180),
  quantity: nullablePositiveInt,
  price: nullablePositiveNumber,
});

export const storefrontAnalyticsEventNameSchema = z.enum([
  "session_start",
  "page_view",
  "select_item",
  "view_item_list",
  "view_item",
  "view_item_media",
  "search",
  "filter_apply",
  "sort_change",
  "add_to_cart",
  "remove_from_cart",
  "view_cart",
  "begin_checkout",
  "checkout_submit",
  "purchase",
  "api_error",
  "buy_now_click",
  "cart_checkout_click",
  "checkout_view",
  "checkout_submit_attempt",
  "order_create_success",
  "order_create_failed",
  "order_verification_failed_after_create",
  "web_vital",
  "navigation_click",
  "navigation_menu_open",
  "locale_change",
  "ai_assistant_open",
  "ai_assistant_message",
  "ai_assistant_result_click",
  "ai_assistant_error",
  "ai_assistant_run",
]);

export const storefrontAnalyticsEventSchema = z.object({
  eventVersion: z.literal(1).optional(),
  eventId: z.string().trim().min(1).max(120),
  visitId: nullableTrimmedString(120),
  journeyId: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().min(1).max(120),
  eventName: storefrontAnalyticsEventNameSchema,
  gaEventName: nullableTrimmedString(120),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  pagePath: nullableTrimmedString(2048),
  pageType: nullableTrimmedString(80),
  locale: nullableTrimmedString(12),
  referrer: nullableTrimmedString(500),
  utmSource: nullableTrimmedString(120),
  utmMedium: nullableTrimmedString(120),
  utmCampaign: nullableTrimmedString(180),
  utmTerm: nullableTrimmedString(180),
  utmContent: nullableTrimmedString(180),
  productId: nullablePositiveInt,
  productSlug: nullableTrimmedString(180),
  categoryId: nullablePositiveInt,
  categorySlug: nullableTrimmedString(180),
  brandId: nullablePositiveInt,
  brandSlug: nullableTrimmedString(180),
  orderId: nullablePositiveInt,
  searchTerm: nullableTrimmedString(250),
  quantity: nullablePositiveInt,
  value: nullablePositiveNumber,
  currency: z.string().trim().min(1).max(12).default("DZD"),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type StorefrontAnalyticsEvent = z.infer<typeof storefrontAnalyticsEventSchema>;

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getMetadataBoolean(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "boolean" ? value : null;
}

function compactMetaTracking(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const tracking = value as Record<string, unknown>;
  const pixel = tracking.pixel && typeof tracking.pixel === "object" && !Array.isArray(tracking.pixel)
    ? tracking.pixel as Record<string, unknown>
    : {};
  const capi = tracking.capi && typeof tracking.capi === "object" && !Array.isArray(tracking.capi)
    ? tracking.capi as Record<string, unknown>
    : {};

  return {
    ...(typeof tracking.eventName === "string" ? { eventName: tracking.eventName } : {}),
    ...(typeof tracking.eventId === "string" ? { eventId: tracking.eventId } : {}),
    ...(typeof tracking.eventTime === "number" || typeof tracking.eventTime === "string"
      ? { eventTime: tracking.eventTime }
      : {}),
    pixel: {
      invoked: pixel.invoked === true || pixel.fired === true,
    },
    capi: {
      queued: capi.queued === true,
      attempted: capi.attempted === true,
      ...(typeof capi.status === "number" ? { status: capi.status } : {}),
      ...(typeof capi.ok === "boolean" ? { ok: capi.ok } : {}),
    },
  };
}

export function buildStoredAnalyticsMetadata(event: StorefrontAnalyticsEvent) {
  const {
    landingUrl: _landingUrl,
    landingHost: _landingHost,
    userAgent: _userAgent,
    fbc: _fbc,
    paidClickSeenAt: _paidClickSeenAt,
    paidClickCookie: _paidClickCookie,
    title: _title,
    metaTracking,
    ...metadata
  } = event.metadata;
  const compactTracking = compactMetaTracking(metaTracking);

  return {
    eventVersion: event.eventVersion ?? 0,
    ...metadata,
    ...(compactTracking ? { metaTracking: compactTracking } : {}),
  };
}

function getPageUrl(pagePath: string | null | undefined) {
  if (!pagePath) {
    return null;
  }

  try {
    return new URL(pagePath, "https://bricomaitre.com");
  } catch {
    return null;
  }
}

function getEventPageUrl(event: StorefrontAnalyticsEvent) {
  return getPageUrl(getMetadataString(event.metadata, "landingUrl"))
    ?? getPageUrl(event.pagePath);
}

function getLandingQuery(url: URL | null) {
  if (!url) {
    return {};
  }

  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }

  return query;
}

function isMetaPaidMedium(value: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ["cpc", "ppc", "paid", "paid_social", "social_paid", "cpv", "cpm"].some((item) => normalized.includes(item));
}

function classifyPaidSource(event: StorefrontAnalyticsEvent) {
  const metadata = event.metadata;
  const pageUrl = getEventPageUrl(event);
  const fbclid = pageUrl?.searchParams.get("fbclid")?.trim();
  if (fbclid) {
    return "fbclid" as const;
  }

  if (
    event.utmSource
    && ["fb", "facebook", "meta"].includes(event.utmSource.toLowerCase())
    && isMetaPaidMedium(event.utmMedium)
  ) {
    return "meta_utm" as const;
  }

  if (getMetadataBoolean(metadata, "paidClickCookie")) {
    return "unknown" as const;
  }

  return null;
}

async function upsertPaidClickVisit(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  event: StorefrontAnalyticsEvent,
  occurredAt: Date,
) {
  const visitId = event.visitId;
  if (!visitId) {
    return;
  }

  const metadata = event.metadata;
  const now = new Date();
  const paidSource = classifyPaidSource(event);
  const shouldCreate = (event.eventName === "session_start" || event.eventName === "page_view") && paidSource;

  if (shouldCreate) {
    const pageUrl = getEventPageUrl(event);
    const fbclidRaw = pageUrl?.searchParams.get("fbclid")?.trim() || null;
    const purchaseCount = event.eventName === "purchase" ? 1 : 0;

    await tx
      .insert(analyticsPaidClickVisits)
      .values({
        visitId,
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        landingUrl: getMetadataString(metadata, "landingUrl") ?? pageUrl?.toString() ?? event.pagePath ?? "/",
        landingPath: pageUrl ? `${pageUrl.pathname}${pageUrl.search}` : event.pagePath ?? "/",
        landingQuery: getLandingQuery(pageUrl),
        landingHost: getMetadataString(metadata, "landingHost") ?? pageUrl?.host ?? null,
        referrer: event.referrer,
        userAgent: getMetadataString(metadata, "userAgent"),
        storefrontVariant: getMetadataString(metadata, "storefrontVariant"),
        requestedVariant: getMetadataString(metadata, "requestedVariant"),
        experimentMode: getMetadataString(metadata, "experimentMode"),
        experimentSource: getMetadataString(metadata, "experimentSource"),
        fbclidRaw,
        fbc: getMetadataString(metadata, "fbc"),
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        utmTerm: event.utmTerm,
        utmContent: event.utmContent,
        paidSource,
        journeyId: event.journeyId,
        sessionId: event.sessionId,
        orderId: event.orderId,
        entryEventId: event.eventId,
        lastEventName: event.eventName,
        lastEventAt: occurredAt,
        eventCount: 1,
        purchaseCount,
        expiresAt: new Date(occurredAt.getTime() + 7 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: analyticsPaidClickVisits.visitId,
        set: {
          lastSeenAt: occurredAt,
          referrer: event.referrer ?? sql`${analyticsPaidClickVisits.referrer}`,
          storefrontVariant: getMetadataString(metadata, "storefrontVariant") ?? sql`${analyticsPaidClickVisits.storefrontVariant}`,
          requestedVariant: getMetadataString(metadata, "requestedVariant") ?? sql`${analyticsPaidClickVisits.requestedVariant}`,
          experimentMode: getMetadataString(metadata, "experimentMode") ?? sql`${analyticsPaidClickVisits.experimentMode}`,
          experimentSource: getMetadataString(metadata, "experimentSource") ?? sql`${analyticsPaidClickVisits.experimentSource}`,
          fbclidRaw: fbclidRaw ?? sql`${analyticsPaidClickVisits.fbclidRaw}`,
          fbc: getMetadataString(metadata, "fbc") ?? sql`${analyticsPaidClickVisits.fbc}`,
          utmSource: sql`coalesce(${analyticsPaidClickVisits.utmSource}, ${event.utmSource})`,
          utmMedium: sql`coalesce(${analyticsPaidClickVisits.utmMedium}, ${event.utmMedium})`,
          utmCampaign: sql`coalesce(${analyticsPaidClickVisits.utmCampaign}, ${event.utmCampaign})`,
          utmTerm: sql`coalesce(${analyticsPaidClickVisits.utmTerm}, ${event.utmTerm})`,
          utmContent: sql`coalesce(${analyticsPaidClickVisits.utmContent}, ${event.utmContent})`,
          paidSource: paidSource === "unknown"
            ? sql`case
                when ${analyticsPaidClickVisits.paidSource} in ('fbclid', 'meta_utm')
                  then ${analyticsPaidClickVisits.paidSource}
                else 'unknown'
              end`
            : paidSource,
          journeyId: sql`coalesce(${analyticsPaidClickVisits.journeyId}, ${event.journeyId})`,
          sessionId: sql`coalesce(${analyticsPaidClickVisits.sessionId}, ${event.sessionId})`,
          orderId: sql`coalesce(${analyticsPaidClickVisits.orderId}, ${event.orderId})`,
          entryEventId: sql`coalesce(${analyticsPaidClickVisits.entryEventId}, ${event.eventId})`,
          lastEventName: event.eventName,
          lastEventAt: occurredAt,
          eventCount: sql`${analyticsPaidClickVisits.eventCount} + 1`,
          purchaseCount: sql`${analyticsPaidClickVisits.purchaseCount} + ${purchaseCount}`,
          updatedAt: now,
        },
      });
    return;
  }

  const purchaseCount = event.eventName === "purchase" ? 1 : 0;
  await tx
    .update(analyticsPaidClickVisits)
    .set({
      journeyId: sql`coalesce(${analyticsPaidClickVisits.journeyId}, ${event.journeyId})`,
      sessionId: sql`coalesce(${analyticsPaidClickVisits.sessionId}, ${event.sessionId})`,
      orderId: sql`coalesce(${analyticsPaidClickVisits.orderId}, ${event.orderId})`,
      lastSeenAt: occurredAt,
      lastEventName: event.eventName,
      lastEventAt: occurredAt,
      eventCount: sql`${analyticsPaidClickVisits.eventCount} + 1`,
      purchaseCount: sql`${analyticsPaidClickVisits.purchaseCount} + ${purchaseCount}`,
      updatedAt: now,
    })
    .where(eq(analyticsPaidClickVisits.visitId, visitId));
}

function computePopularitySql(
  table: typeof products | typeof categories | typeof brands,
  addView: number,
  addCart: number,
  addCheckout: number,
  addPurchase: number,
) {
  return sql`(
    (${table.viewCount} + ${addView})::numeric
    + ((${table.addToCartCount} + ${addCart})::numeric * 3)
    + ((${table.checkoutCount} + ${addCheckout})::numeric * 5)
    + ((${table.purchaseCount} + ${addPurchase})::numeric * 8)
  )`;
}

function computeConversionSql(
  table: typeof products | typeof categories | typeof brands,
  addView: number,
  addPurchase: number,
) {
  return sql`case
    when (${table.viewCount} + ${addView}) > 0
      then ((${table.purchaseCount} + ${addPurchase})::numeric / (${table.viewCount} + ${addView})::numeric)
    else 0
  end`;
}

function extractItems(event: StorefrontAnalyticsEvent) {
  const rawItems = Array.isArray(event.metadata.items) ? event.metadata.items : [];
  const parsedItems = rawItems
    .map((item) => analyticsItemSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);

  if (parsedItems.length > 0) {
    return parsedItems;
  }

  if (!event.productId && !event.productSlug) {
    return [];
  }

  return [
    {
      productId: event.productId,
      productSlug: event.productSlug,
      categoryId: event.categoryId,
      categorySlug: event.categorySlug,
      brandId: event.brandId,
      brandSlug: event.brandSlug,
      quantity: event.quantity ?? 1,
      price: event.value,
    },
  ];
}

async function updateCatalogMetrics(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  event: StorefrontAnalyticsEvent,
) {
  const items = extractItems(event);
  const metricBump = {
    view: event.eventName === "view_item" ? 1 : 0,
    cart: event.eventName === "add_to_cart" ? 1 : 0,
    checkout: event.eventName === "begin_checkout" ? 1 : 0,
    purchase: event.eventName === "purchase" ? 1 : 0,
  };

  if (metricBump.view === 0 && metricBump.cart === 0 && metricBump.checkout === 0 && metricBump.purchase === 0) {
    return;
  }

  for (const item of items) {
    const quantity = Math.max(1, item.quantity ?? 1);
    const productView = metricBump.view;
    const productCart = metricBump.cart * quantity;
    const productCheckout = metricBump.checkout * quantity;
    const productPurchase = metricBump.purchase * quantity;

    if (item.productId) {
      await tx
        .update(products)
        .set({
          viewCount: sql`${products.viewCount} + ${productView}`,
          addToCartCount: sql`${products.addToCartCount} + ${productCart}`,
          checkoutCount: sql`${products.checkoutCount} + ${productCheckout}`,
          purchaseCount: sql`${products.purchaseCount} + ${productPurchase}`,
          popularityScore: computePopularitySql(products, productView, productCart, productCheckout, productPurchase),
          conversionRate: computeConversionSql(products, productView, productPurchase),
          lastViewedAt: metricBump.view > 0 ? sql`greatest(coalesce(${products.lastViewedAt}, to_timestamp(0)), ${event.occurredAt ? new Date(event.occurredAt) : new Date()})` : undefined,
        })
        .where(eq(products.id, item.productId));
    }

    if (item.categoryId) {
      await tx
        .update(categories)
        .set({
          viewCount: sql`${categories.viewCount} + ${productView}`,
          addToCartCount: sql`${categories.addToCartCount} + ${productCart}`,
          checkoutCount: sql`${categories.checkoutCount} + ${productCheckout}`,
          purchaseCount: sql`${categories.purchaseCount} + ${productPurchase}`,
          popularityScore: computePopularitySql(categories, productView, productCart, productCheckout, productPurchase),
          conversionRate: computeConversionSql(categories, productView, productPurchase),
          lastViewedAt: metricBump.view > 0 ? sql`greatest(coalesce(${categories.lastViewedAt}, to_timestamp(0)), ${event.occurredAt ? new Date(event.occurredAt) : new Date()})` : undefined,
        })
        .where(eq(categories.id, item.categoryId));
    }

    if (item.brandId) {
      await tx
        .update(brands)
        .set({
          viewCount: sql`${brands.viewCount} + ${productView}`,
          addToCartCount: sql`${brands.addToCartCount} + ${productCart}`,
          checkoutCount: sql`${brands.checkoutCount} + ${productCheckout}`,
          purchaseCount: sql`${brands.purchaseCount} + ${productPurchase}`,
          popularityScore: computePopularitySql(brands, productView, productCart, productCheckout, productPurchase),
          conversionRate: computeConversionSql(brands, productView, productPurchase),
          lastViewedAt: metricBump.view > 0 ? sql`greatest(coalesce(${brands.lastViewedAt}, to_timestamp(0)), ${event.occurredAt ? new Date(event.occurredAt) : new Date()})` : undefined,
        })
        .where(eq(brands.id, item.brandId));
    }
  }
}

export async function ingestStorefrontAnalyticsEvent(
  db: Database,
  rawEvent: StorefrontAnalyticsEvent,
) {
  const event = storefrontAnalyticsEventSchema.parse(rawEvent);
  const occurredAt = event.occurredAt ? new Date(event.occurredAt) : new Date();

  return db.transaction(async (tx) => {
    await tx
      .insert(analyticsJourneys)
      .values({
        id: event.journeyId,
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        firstPath: event.pagePath,
        lastPath: event.pagePath,
        locale: event.locale,
        referrer: event.referrer,
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        utmTerm: event.utmTerm,
        utmContent: event.utmContent,
      })
      .onConflictDoUpdate({
        target: analyticsJourneys.id,
        set: {
          lastSeenAt: occurredAt,
          lastPath: event.pagePath ?? sql`${analyticsJourneys.lastPath}`,
          locale: event.locale ?? sql`${analyticsJourneys.locale}`,
          referrer: event.referrer ?? sql`${analyticsJourneys.referrer}`,
          utmSource: sql`coalesce(${analyticsJourneys.utmSource}, ${event.utmSource})`,
          utmMedium: sql`coalesce(${analyticsJourneys.utmMedium}, ${event.utmMedium})`,
          utmCampaign: sql`coalesce(${analyticsJourneys.utmCampaign}, ${event.utmCampaign})`,
          utmTerm: sql`coalesce(${analyticsJourneys.utmTerm}, ${event.utmTerm})`,
          utmContent: sql`coalesce(${analyticsJourneys.utmContent}, ${event.utmContent})`,
        },
      });

    const insertedRows = await tx
      .insert(analyticsEvents)
      .values({
        eventId: event.eventId,
        visitId: event.visitId,
        journeyId: event.journeyId,
        sessionId: event.sessionId,
        eventName: event.eventName,
        gaEventName: event.gaEventName,
        pagePath: event.pagePath,
        pageType: event.pageType,
        locale: event.locale,
        referrer: event.referrer,
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        utmTerm: event.utmTerm,
        utmContent: event.utmContent,
        productId: event.productId,
        productSlug: event.productSlug,
        categoryId: event.categoryId,
        categorySlug: event.categorySlug,
        brandId: event.brandId,
        brandSlug: event.brandSlug,
        orderId: event.orderId,
        searchTerm: event.searchTerm,
        quantity: event.quantity,
        value: event.value == null ? null : event.value.toFixed(2),
        currency: event.currency,
        metadata: buildStoredAnalyticsMetadata(event),
        occurredAt,
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: analyticsEvents.eventId })
      .returning({ id: analyticsEvents.id });

    if (insertedRows.length === 0) {
      return { ok: true as const, deduped: true };
    }

    await upsertPaidClickVisit(tx, event, occurredAt);

    if (event.eventName === "purchase") {
      await tx
        .update(analyticsJourneys)
        .set({
          orderCount: sql`${analyticsJourneys.orderCount} + 1`,
          purchaseCount: sql`${analyticsJourneys.purchaseCount} + 1`,
          firstOrderId: sql`coalesce(${analyticsJourneys.firstOrderId}, ${event.orderId})`,
        })
        .where(eq(analyticsJourneys.id, event.journeyId));
    }

    await updateCatalogMetrics(tx, event);

    return { ok: true as const, deduped: false };
  });
}

export function buildAnalyticsDateWhere(
  filters: { startDate?: string | null; endDate?: string | null },
) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(gte(analyticsEvents.occurredAt, new Date(`${filters.startDate}T00:00:00.000Z`)));
  }

  if (filters.endDate) {
    conditions.push(lte(analyticsEvents.occurredAt, new Date(`${filters.endDate}T23:59:59.999Z`)));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function attachJourneyToOrder(
  db: Database,
  orderId: number,
  journeyId: string | null,
  _sessionId: string | null,
) {
  if (!journeyId) {
    return;
  }

  await db
    .update(analyticsJourneys)
    .set({
      firstOrderId: sql`coalesce(${analyticsJourneys.firstOrderId}, ${orderId})`,
    })
    .where(eq(analyticsJourneys.id, journeyId));
}
