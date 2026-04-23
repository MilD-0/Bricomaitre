import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '../db/client';
import {
  analyticsEvents,
  analyticsPaidClickVisits,
  orders,
} from '../db/schema';

const rangeValues = ['24h', '7d', '30d', 'custom'] as const;
const variantValues = ['all', 'control', 'fast_checkout'] as const;
const paidSourceFilterValues = ['all', 'fbclid', 'meta_utm', 'unknown'] as const;
const outcomeValues = [
  'all',
  'landed_only',
  'viewed_product',
  'added_to_cart',
  'began_checkout',
  'created_order',
  'purchased',
  'errored',
] as const;
const hasOrderValues = ['all', 'yes', 'no'] as const;

export const paidClickListQuerySchema = z.object({
  range: z.enum(rangeValues).default('24h'),
  startDate: z.string().trim().optional().nullable(),
  endDate: z.string().trim().optional().nullable(),
  variant: z.enum(variantValues).default('all'),
  paidSource: z.enum(paidSourceFilterValues).default('all'),
  outcome: z.enum(outcomeValues).default('all'),
  search: z.string().trim().default(''),
  hasOrder: z.enum(hasOrderValues).default('all'),
  cursor: z.string().trim().optional().nullable(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaidClickListQuery = z.infer<typeof paidClickListQuerySchema>;

export type PaidClickListItem = {
  visitId: string;
  firstSeenAt: string;
  lastSeenAt: string;
  landingUrl: string;
  landingPath: string;
  landingProductSlug: string | null;
  storefrontVariant: string | null;
  requestedVariant: string | null;
  paidSource: string;
  lastEventName: string | null;
  eventCount: number;
  purchaseCount: number;
  orderId: number | null;
};

export type PaidClickListSummary = {
  visits: number;
  landedOnly: number;
  viewedProduct: number;
  addedToCart: number;
  beganCheckout: number;
  createdOrder: number;
  purchased: number;
  errored: number;
};

export type PaidClickTimelineEvent = {
  eventId: string;
  eventName: string;
  pagePath: string | null;
  pageType: string | null;
  productSlug: string | null;
  orderId: number | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
  metaTracking: null | {
    eventName: string | null;
    pixelFired: boolean;
    pixelPayload: Record<string, unknown>;
    capiAttempted: boolean;
    capiPayload: Record<string, unknown>;
    capiStatus: number | null;
    capiOk: boolean;
  };
};

export type PaidClickVisitDetail = {
  visit: {
    visitId: string;
    firstSeenAt: string;
    lastSeenAt: string;
    landingUrl: string;
    landingPath: string;
    landingQuery: Record<string, string>;
    landingHost: string | null;
    referrer: string | null;
    userAgent: string | null;
    storefrontVariant: string | null;
    requestedVariant: string | null;
    experimentMode: string | null;
    experimentSource: string | null;
    fbclidRaw: string | null;
    fbc: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmTerm: string | null;
    utmContent: string | null;
    paidSource: string;
    journeyId: string | null;
    sessionId: string | null;
    orderId: number | null;
    entryEventId: string | null;
    lastEventName: string | null;
    lastEventAt: string | null;
    eventCount: number;
    purchaseCount: number;
  };
  timeline: PaidClickTimelineEvent[];
  order: null | {
    id: number;
    publicToken: string | null;
    confirmed: number;
    createdAt: string;
    updatedAt: string;
    phoneNumber1: string;
    city: string | null;
  };
};

function toIsoDateString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseDateValue(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${String(value)}`);
  }

  return date;
}

function resolveDateRange(input: PaidClickListQuery) {
  const now = new Date();

  if (input.range === 'custom') {
    return {
      start: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : new Date(now.getTime() - 24 * 60 * 60 * 1000),
      end: input.endDate ? new Date(`${input.endDate}T23:59:59.999Z`) : now,
    };
  }

  const durationMs = input.range === '7d'
    ? 7 * 24 * 60 * 60 * 1000
    : input.range === '30d'
      ? 30 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

  return {
    start: new Date(now.getTime() - durationMs),
    end: now,
  };
}

function decodeCursor(cursor: string | null | undefined) {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      firstSeenAt: string;
      visitId: string;
    };
    if (!parsed.firstSeenAt || !parsed.visitId) {
      return null;
    }

    return {
      firstSeenAt: new Date(parsed.firstSeenAt),
      visitId: parsed.visitId,
    };
  } catch {
    return null;
  }
}

function encodeCursor(value: { firstSeenAt: Date; visitId: string }) {
  return Buffer.from(JSON.stringify({
    firstSeenAt: value.firstSeenAt.toISOString(),
    visitId: value.visitId,
  }), 'utf8').toString('base64url');
}

function deriveLandingProductSlug(path: string) {
  try {
    const url = new URL(path, 'https://bricomaitre.com');
    const match = url.pathname.match(/^\/(?:products|landing)\/([^/?#]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function parseInteger(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && /^-?[0-9]+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return null;
}

function parseMetaTracking(value: unknown): PaidClickTimelineEvent['metaTracking'] {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const pixel = candidate.pixel && typeof candidate.pixel === 'object' ? candidate.pixel as Record<string, unknown> : {};
  const capi = candidate.capi && typeof candidate.capi === 'object' ? candidate.capi as Record<string, unknown> : {};

  return {
    eventName: typeof candidate.eventName === 'string' ? candidate.eventName : null,
    pixelFired: pixel.fired === true,
    pixelPayload: pixel.payload && typeof pixel.payload === 'object' ? pixel.payload as Record<string, unknown> : {},
    capiAttempted: capi.attempted === true,
    capiPayload: capi.payload && typeof capi.payload === 'object' ? capi.payload as Record<string, unknown> : {},
    capiStatus: parseInteger(capi.status),
    capiOk: capi.ok === true,
  };
}

function buildOutcomeCondition(outcome: PaidClickListQuery['outcome']): SQL | undefined {
  if (outcome === 'all') {
    return undefined;
  }

  const visitIdColumn = analyticsPaidClickVisits.visitId;
  const hasEvent = (eventName: string) => sql`exists (
    select 1
    from ${analyticsEvents}
    where ${analyticsEvents.visitId} = ${visitIdColumn}
      and ${analyticsEvents.eventName} = ${eventName}
  )`;
  const hasCheckoutStart = sql`(${hasEvent('begin_checkout')} or ${hasEvent('checkout_view')})`;

  if (outcome === 'landed_only') {
    return and(
      sql`not ${hasEvent('view_item')}`,
      sql`not ${hasEvent('add_to_cart')}`,
      sql`not ${hasCheckoutStart}`,
      isNull(analyticsPaidClickVisits.orderId),
      sql`${analyticsPaidClickVisits.purchaseCount} = 0`,
      sql`not ${hasEvent('api_error')}`,
    ) as SQL;
  }

  if (outcome === 'viewed_product') {
    return and(
      hasEvent('view_item'),
      sql`not ${hasEvent('add_to_cart')}`,
      sql`not ${hasCheckoutStart}`,
      isNull(analyticsPaidClickVisits.orderId),
      sql`${analyticsPaidClickVisits.purchaseCount} = 0`,
    ) as SQL;
  }

  if (outcome === 'added_to_cart') {
    return and(
      hasEvent('add_to_cart'),
      sql`not ${hasCheckoutStart}`,
      isNull(analyticsPaidClickVisits.orderId),
      sql`${analyticsPaidClickVisits.purchaseCount} = 0`,
    ) as SQL;
  }

  if (outcome === 'began_checkout') {
    return and(
      hasCheckoutStart,
      isNull(analyticsPaidClickVisits.orderId),
      sql`${analyticsPaidClickVisits.purchaseCount} = 0`,
    ) as SQL;
  }

  if (outcome === 'created_order') {
    return and(
      isNotNull(analyticsPaidClickVisits.orderId),
      sql`${analyticsPaidClickVisits.purchaseCount} = 0`,
    ) as SQL;
  }

  if (outcome === 'purchased') {
    return sql`${analyticsPaidClickVisits.purchaseCount} > 0`;
  }

  return hasEvent('api_error');
}

function buildListWhere(input: PaidClickListQuery) {
  const { start, end } = resolveDateRange(input);
  const conditions: SQL[] = [
    gte(analyticsPaidClickVisits.firstSeenAt, start),
    lte(analyticsPaidClickVisits.firstSeenAt, end),
  ];

  if (input.variant !== 'all') {
    conditions.push(eq(analyticsPaidClickVisits.requestedVariant, input.variant));
  }

  if (input.paidSource !== 'all') {
    conditions.push(eq(analyticsPaidClickVisits.paidSource, input.paidSource));
  }

  if (input.hasOrder === 'yes') {
    conditions.push(isNotNull(analyticsPaidClickVisits.orderId));
  } else if (input.hasOrder === 'no') {
    conditions.push(isNull(analyticsPaidClickVisits.orderId));
  }

  if (input.search.length > 0) {
    conditions.push(ilike(analyticsPaidClickVisits.landingPath, `%${input.search}%`));
  }

  const outcomeCondition = buildOutcomeCondition(input.outcome);
  if (outcomeCondition) {
    conditions.push(outcomeCondition);
  }

  const cursor = decodeCursor(input.cursor);
  if (cursor) {
    conditions.push(sql`(
      ${analyticsPaidClickVisits.firstSeenAt} < ${cursor.firstSeenAt}
      or (
        ${analyticsPaidClickVisits.firstSeenAt} = ${cursor.firstSeenAt}
        and ${analyticsPaidClickVisits.visitId} < ${cursor.visitId}
      )
    )`);
  }

  return and(...conditions);
}

async function countVisits(baseInput: PaidClickListQuery, outcome?: PaidClickListQuery['outcome']) {
  const db = getDb();
  const input = outcome ? { ...baseInput, outcome } : baseInput;
  const where = buildListWhere({ ...input, cursor: null, limit: baseInput.limit });
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(analyticsPaidClickVisits)
    .where(where);

  return row?.count ?? 0;
}

export async function listPaidClickVisits(rawInput: PaidClickListQuery) {
  const input = paidClickListQuerySchema.parse(rawInput);
  const db = getDb();
  const where = buildListWhere(input);

  const rows = await db
    .select({
      visitId: analyticsPaidClickVisits.visitId,
      firstSeenAt: analyticsPaidClickVisits.firstSeenAt,
      lastSeenAt: analyticsPaidClickVisits.lastSeenAt,
      landingUrl: analyticsPaidClickVisits.landingUrl,
      landingPath: analyticsPaidClickVisits.landingPath,
      storefrontVariant: analyticsPaidClickVisits.storefrontVariant,
      requestedVariant: analyticsPaidClickVisits.requestedVariant,
      paidSource: analyticsPaidClickVisits.paidSource,
      lastEventName: analyticsPaidClickVisits.lastEventName,
      eventCount: analyticsPaidClickVisits.eventCount,
      purchaseCount: analyticsPaidClickVisits.purchaseCount,
      orderId: analyticsPaidClickVisits.orderId,
    })
    .from(analyticsPaidClickVisits)
    .where(where)
    .orderBy(desc(analyticsPaidClickVisits.firstSeenAt), desc(analyticsPaidClickVisits.visitId))
    .limit(input.limit + 1);

  const hasMore = rows.length > input.limit;
  const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && lastRow
    ? encodeCursor({
        firstSeenAt: parseDateValue(lastRow.firstSeenAt),
        visitId: lastRow.visitId,
      })
    : null;

  const [visits, landedOnly, viewedProduct, addedToCart, beganCheckout, createdOrder, purchased, errored] = await Promise.all([
    countVisits(input),
    countVisits(input, 'landed_only'),
    countVisits(input, 'viewed_product'),
    countVisits(input, 'added_to_cart'),
    countVisits(input, 'began_checkout'),
    countVisits(input, 'created_order'),
    countVisits(input, 'purchased'),
    countVisits(input, 'errored'),
  ]);

  return {
    items: pageRows.map<PaidClickListItem>((row) => ({
      visitId: row.visitId,
      firstSeenAt: toIsoDateString(row.firstSeenAt) ?? new Date(0).toISOString(),
      lastSeenAt: toIsoDateString(row.lastSeenAt) ?? new Date(0).toISOString(),
      landingUrl: row.landingUrl,
      landingPath: row.landingPath,
      landingProductSlug: deriveLandingProductSlug(row.landingPath),
      storefrontVariant: row.storefrontVariant,
      requestedVariant: row.requestedVariant,
      paidSource: row.paidSource,
      lastEventName: row.lastEventName,
      eventCount: row.eventCount,
      purchaseCount: row.purchaseCount,
      orderId: row.orderId,
    })),
    nextCursor,
    summary: {
      visits,
      landedOnly,
      viewedProduct,
      addedToCart,
      beganCheckout,
      createdOrder,
      purchased,
      errored,
    } satisfies PaidClickListSummary,
  };
}

export async function getPaidClickVisitDetail(visitId: string) {
  const db = getDb();
  const [visitRow] = await db
    .select()
    .from(analyticsPaidClickVisits)
    .where(eq(analyticsPaidClickVisits.visitId, visitId))
    .limit(1);

  if (!visitRow) {
    return null;
  }

  const eventRows = await db
    .select({
      eventId: analyticsEvents.eventId,
      eventName: analyticsEvents.eventName,
      pagePath: analyticsEvents.pagePath,
      pageType: analyticsEvents.pageType,
      productSlug: analyticsEvents.productSlug,
      orderId: analyticsEvents.orderId,
      occurredAt: analyticsEvents.occurredAt,
      metadata: analyticsEvents.metadata,
    })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.visitId, visitId))
    .orderBy(asc(analyticsEvents.occurredAt), asc(analyticsEvents.id));

  const [orderRow] = visitRow.orderId == null
    ? [null]
    : await db
        .select({
          id: orders.id,
          publicToken: orders.publicToken,
          confirmed: orders.confirmed,
          createdAt: orders.createdAt,
          updatedAt: orders.updatedAt,
          phoneNumber1: orders.phoneNumber1,
          city: orders.city,
        })
        .from(orders)
        .where(eq(orders.id, visitRow.orderId))
        .limit(1);

  return {
    visit: {
      visitId: visitRow.visitId,
      firstSeenAt: toIsoDateString(visitRow.firstSeenAt) ?? new Date(0).toISOString(),
      lastSeenAt: toIsoDateString(visitRow.lastSeenAt) ?? new Date(0).toISOString(),
      landingUrl: visitRow.landingUrl,
      landingPath: visitRow.landingPath,
      landingQuery: (visitRow.landingQuery ?? {}) as Record<string, string>,
      landingHost: visitRow.landingHost,
      referrer: visitRow.referrer,
      userAgent: visitRow.userAgent,
      storefrontVariant: visitRow.storefrontVariant,
      requestedVariant: visitRow.requestedVariant,
      experimentMode: visitRow.experimentMode,
      experimentSource: visitRow.experimentSource,
      fbclidRaw: visitRow.fbclidRaw,
      fbc: visitRow.fbc,
      utmSource: visitRow.utmSource,
      utmMedium: visitRow.utmMedium,
      utmCampaign: visitRow.utmCampaign,
      utmTerm: visitRow.utmTerm,
      utmContent: visitRow.utmContent,
      paidSource: visitRow.paidSource,
      journeyId: visitRow.journeyId,
      sessionId: visitRow.sessionId,
      orderId: visitRow.orderId,
      entryEventId: visitRow.entryEventId,
      lastEventName: visitRow.lastEventName,
      lastEventAt: toIsoDateString(visitRow.lastEventAt),
      eventCount: visitRow.eventCount,
      purchaseCount: visitRow.purchaseCount,
    },
    timeline: eventRows.map<PaidClickTimelineEvent>((row) => ({
      eventId: row.eventId,
      eventName: row.eventName,
      pagePath: row.pagePath,
      pageType: row.pageType,
      productSlug: row.productSlug,
      orderId: row.orderId,
      occurredAt: toIsoDateString(row.occurredAt) ?? new Date(0).toISOString(),
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      metaTracking: parseMetaTracking(
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>).metaTracking
          : null,
      ),
    })),
    order: orderRow ? {
      id: orderRow.id,
      publicToken: orderRow.publicToken,
      confirmed: orderRow.confirmed,
      createdAt: toIsoDateString(orderRow.createdAt) ?? new Date(0).toISOString(),
      updatedAt: toIsoDateString(orderRow.updatedAt) ?? new Date(0).toISOString(),
      phoneNumber1: orderRow.phoneNumber1,
      city: orderRow.city,
    } : null,
  } satisfies PaidClickVisitDetail;
}

export async function cleanupExpiredPaidClickVisits() {
  const db = getDb();
  const deletedRows = await db
    .delete(analyticsPaidClickVisits)
    .where(lte(analyticsPaidClickVisits.expiresAt, new Date()))
    .returning({ visitId: analyticsPaidClickVisits.visitId });

  return {
    deletedCount: deletedRows.length,
  };
}
