import { and, eq, inArray, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  marketingEventOutbox,
  orderAiInfluence,
  orderAcquisitionAttribution,
  orderLineItems,
  orderMarketingAttribution,
  orders,
} from '@bric/db/schema';
import { parseNumericAmount } from '../orders-support';
import {
  getOrderCompletedEventId,
  getOrderConfirmedEventId,
  hashMetaValue,
  normalizeAlgeriaPhone,
  type MetaCommerceLine,
  type MetaRequestContext,
} from './meta';
import {
  MARKETING_SEMANTICS_VERSION,
  ORDER_AI_INFLUENCE_SEMANTICS_VERSION,
  ORDER_ACQUISITION_SEMANTICS_VERSION,
  type StorefrontAcquisitionTouch,
  type StorefrontOrderMarketing,
} from './marketing-contracts';
import { classifyAcquisition, isNonDirectAcquisition } from './acquisition';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;
type Destination = 'google' | 'tiktok';
type OutboxRow = typeof marketingEventOutbox.$inferSelect;

function normalizeCampaignIdentifier(value: string | null | undefined) {
  const normalized = normalizeIdentifier(value);
  return normalized && /^\d{6,30}$/.test(normalized) ? normalized : null;
}

export function buildOrderAcquisitionSnapshot(
  marketing: StorefrontOrderMarketing,
  context: { hasMetaClick?: boolean; now?: Date } = {},
) {
  const legacy = marketing.acquisition;
  const legacyTouch: StorefrontAcquisitionTouch | null = legacy
    ? {
        sessionId: 'legacy',
        journeyId: 'legacy',
        landingPath: legacy.landingPath,
        referrer: null,
        utmSource: legacy.utmSource,
        utmMedium: legacy.utmMedium,
        utmCampaign: legacy.utmCampaign,
        utmTerm: legacy.utmTerm,
        utmContent: legacy.utmContent,
        hasMetaClickId: context.hasMetaClick === true,
        hasGoogleClickId: Boolean(
          marketing.google?.gclid || marketing.google?.gbraid || marketing.google?.wbraid,
        ),
        hasTikTokClickId: Boolean(marketing.tiktok?.clickId),
        capturedAt: legacy.capturedAt,
      }
    : null;
  const sessionTouch = marketing.sessionEntry ?? legacyTouch;
  if (!sessionTouch) return null;

  const sessionClassification = classifyAcquisition(sessionTouch);
  const now = context.now ?? new Date();
  const lastNonDirect = marketing.lastNonDirectTouch;
  const lastClassification = lastNonDirect ? classifyAcquisition(lastNonDirect) : null;
  const lastCapturedAt = lastNonDirect ? Date.parse(lastNonDirect.capturedAt) : Number.NaN;
  const eligibleLastNonDirect = Boolean(
    lastNonDirect &&
    lastClassification &&
    isNonDirectAcquisition(lastClassification.channel) &&
    lastCapturedAt <= now.getTime() &&
    lastCapturedAt >= now.getTime() - 7 * 24 * 60 * 60 * 1000,
  );
  const attributedTouch = eligibleLastNonDirect ? lastNonDirect! : sessionTouch;
  const attributedClassification = eligibleLastNonDirect
    ? lastClassification!
    : sessionClassification;
  const source = normalizeIdentifier(attributedTouch.utmSource)?.toLowerCase() ?? null;
  const medium = normalizeIdentifier(attributedTouch.utmMedium)?.toLowerCase() ?? null;
  const channel = attributedClassification.channel;

  let referrerDomain: string | null = null;
  if (attributedTouch.referrer) {
    try {
      referrerDomain = new URL(attributedTouch.referrer).hostname
        .toLowerCase()
        .replace(/^www\./, '');
    } catch {
      referrerDomain = null;
    }
  }

  return {
    semanticsVersion: ORDER_ACQUISITION_SEMANTICS_VERSION,
    attributionModel: 'last_non_direct_7d',
    channel,
    evidence: attributedClassification.evidence,
    sessionChannel: sessionClassification.channel,
    sessionEvidence: sessionClassification.evidence,
    sourceSessionId: attributedTouch.sessionId === 'legacy' ? null : attributedTouch.sessionId,
    referrerDomain,
    sessionStartedAt: new Date(sessionTouch.capturedAt),
    landingPath: attributedTouch.landingPath,
    utmSource: source,
    utmMedium: medium,
    utmCampaign: attributedTouch.utmCampaign ?? null,
    utmTerm: attributedTouch.utmTerm ?? null,
    utmContent: attributedTouch.utmContent ?? null,
    metaCampaignId:
      channel === 'meta_paid' ? normalizeCampaignIdentifier(attributedTouch.utmCampaign) : null,
    metaAdsetId:
      channel === 'meta_paid' ? normalizeCampaignIdentifier(attributedTouch.utmTerm) : null,
    metaAdId:
      channel === 'meta_paid' ? normalizeCampaignIdentifier(attributedTouch.utmContent) : null,
    capturedAt: new Date(attributedTouch.capturedAt),
  };
}

export function buildOrderAiInfluenceSnapshot(input: {
  marketing: StorefrontOrderMarketing;
  orderSessionId: string | null;
  lines: MetaCommerceLine[];
  now: Date;
}) {
  const assistant = input.marketing.assistant;
  const capturedAt = assistant ? new Date(assistant.capturedAt) : input.now;
  const current =
    assistant &&
    capturedAt.getTime() <= input.now.getTime() &&
    capturedAt.getTime() >= input.now.getTime() - 24 * 60 * 60 * 1000;
  if (!current || !assistant) {
    return {
      semanticsVersion: ORDER_AI_INFLUENCE_SEMANTICS_VERSION,
      level: 'none',
      sameSession: false,
      sourceSessionId: null,
      openedAt: null,
      engagedAt: null,
      recommendationClickedAt: null,
      clickedProductIds: [],
      recommendedProductOrdered: false,
      capturedAt: input.now,
    };
  }

  const clickedProductIds = [...new Set(assistant.clickedProductIds)];
  const orderedProductIds = new Set(input.lines.map((line) => line.productId));
  const recommendedProductOrdered = clickedProductIds.some((id) => orderedProductIds.has(id));
  const level = recommendedProductOrdered
    ? 'recommended_product_ordered'
    : assistant.recommendationClickedAt
      ? 'recommendation_clicked'
      : assistant.engagedAt
        ? 'engaged'
        : assistant.openedAt
          ? 'opened'
          : 'none';
  return {
    semanticsVersion: ORDER_AI_INFLUENCE_SEMANTICS_VERSION,
    level,
    sameSession: Boolean(
      input.orderSessionId && assistant.sourceSessionId === input.orderSessionId,
    ),
    sourceSessionId: assistant.sourceSessionId,
    openedAt: assistant.openedAt ? new Date(assistant.openedAt) : null,
    engagedAt: assistant.engagedAt ? new Date(assistant.engagedAt) : null,
    recommendationClickedAt: assistant.recommendationClickedAt
      ? new Date(assistant.recommendationClickedAt)
      : null,
    clickedProductIds,
    recommendedProductOrdered,
    capturedAt,
  };
}

type MarketingEnvironment = Partial<
  Record<
    | 'GOOGLE_ANALYTICS_MEASUREMENT_ID'
    | 'NEXT_PUBLIC_GA_MEASUREMENT_ID'
    | 'GOOGLE_ANALYTICS_API_SECRET'
    | 'TIKTOK_PIXEL_ID'
    | 'NEXT_PUBLIC_TIKTOK_PIXEL_ID'
    | 'TIKTOK_EVENTS_API_ACCESS_TOKEN',
    string | undefined
  >
>;

const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const GOOGLE_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const TIKTOK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000, 43_200_000] as const;

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

export function isMarketingDestinationConfigured(
  destination: Destination,
  env: MarketingEnvironment = process.env as MarketingEnvironment,
) {
  if (destination === 'google') {
    return (
      configured(env.GOOGLE_ANALYTICS_MEASUREMENT_ID ?? env.NEXT_PUBLIC_GA_MEASUREMENT_ID) &&
      configured(env.GOOGLE_ANALYTICS_API_SECRET)
    );
  }

  return (
    configured(env.TIKTOK_PIXEL_ID ?? env.NEXT_PUBLIC_TIKTOK_PIXEL_ID) &&
    configured(env.TIKTOK_EVENTS_API_ACCESS_TOKEN)
  );
}

function normalizeIdentifier(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 250) : null;
}

function lineRowToCommerceLine(row: typeof orderLineItems.$inferSelect): MetaCommerceLine {
  return {
    productId: row.productId ?? Number(row.contentId),
    contentId: row.contentId,
    rawValue: row.rawValue,
    title: row.titleSnapshot,
    originalUnitPrice: parseNumericAmount(row.originalUnitPrice),
    effectiveUnitPrice: parseNumericAmount(row.effectiveUnitPrice),
    unitPurchasePrice:
      row.unitPurchasePriceSnapshot == null
        ? null
        : parseNumericAmount(row.unitPurchasePriceSnapshot),
    quantity: row.quantity,
    discountAmount: parseNumericAmount(row.discountAmount),
    lineTotal: parseNumericAmount(row.lineTotal),
    thumbnailUrl: row.thumbnailUrl,
  };
}

function commerceValue(lines: MetaCommerceLine[]) {
  return Math.round(lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100;
}

function googleItems(lines: MetaCommerceLine[]) {
  return lines.map((line) => ({
    item_id: line.contentId,
    item_name: line.title.slice(0, 100),
    price: line.effectiveUnitPrice,
    quantity: line.quantity,
  }));
}

function tiktokContents(lines: MetaCommerceLine[]) {
  return lines.map((line) => ({
    content_id: line.contentId,
    content_name: line.title.slice(0, 100),
    content_type: 'product',
    price: line.effectiveUnitPrice,
    quantity: line.quantity,
  }));
}

export function buildGoogleMeasurementPayload(input: {
  eventName: string;
  eventId: string;
  orderId: number;
  eventTime: Date;
  clientId: string;
  sessionId?: string | null;
  lines: MetaCommerceLine[];
}) {
  return {
    client_id: input.clientId,
    timestamp_micros: input.eventTime.getTime() * 1000,
    events: [
      {
        name: input.eventName,
        params: {
          event_id: input.eventId,
          transaction_id: String(input.orderId),
          currency: 'DZD',
          value: commerceValue(input.lines),
          items: googleItems(input.lines),
          ...(input.sessionId && /^\d+$/.test(input.sessionId)
            ? { session_id: input.sessionId }
            : {}),
          engagement_time_msec: 1,
        },
      },
    ],
  };
}

export function buildTikTokEventsPayload(input: {
  eventName: string;
  eventId: string;
  orderId: number;
  eventTime: Date;
  eventSourceUrl: string;
  clickId?: string | null;
  cookieId?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  lines: MetaCommerceLine[];
}) {
  const normalizedPhone = normalizeAlgeriaPhone(input.phone);
  const emailHash = hashMetaValue(input.email);
  const phoneHash = normalizedPhone ? hashMetaValue(normalizedPhone) : null;
  const externalIdHash = hashMetaValue(input.externalId);
  const user = {
    ...(normalizeIdentifier(input.clickId) ? { ttclid: normalizeIdentifier(input.clickId) } : {}),
    ...(normalizeIdentifier(input.cookieId) ? { ttp: normalizeIdentifier(input.cookieId) } : {}),
    ...(emailHash ? { email: [emailHash] } : {}),
    ...(phoneHash ? { phone_number: [phoneHash] } : {}),
    ...(externalIdHash ? { external_id: [externalIdHash] } : {}),
  };
  return {
    event_source: 'web',
    data: [
      {
        event: input.eventName,
        event_time: Math.floor(input.eventTime.getTime() / 1000),
        event_id: input.eventId,
        context: {
          user,
          page: { url: input.eventSourceUrl },
          ...(input.clientIpAddress?.trim() ? { ip: input.clientIpAddress.trim() } : {}),
          ...(input.clientUserAgent?.trim() ? { user_agent: input.clientUserAgent.trim() } : {}),
        },
        properties: {
          order_id: String(input.orderId),
          currency: 'DZD',
          value: commerceValue(input.lines),
          content_type: 'product',
          contents: tiktokContents(input.lines),
        },
      },
    ],
  };
}

async function insertDestinationEvent(
  db: Executor,
  input: {
    destination: Destination;
    eventName: string;
    eventId: string;
    source: string;
    orderId: number;
    orderStatusHistoryId?: number | null;
    eventTime: Date;
    payload: Record<string, unknown>;
  },
) {
  const [row] = await db
    .insert(marketingEventOutbox)
    .values({
      ...input,
      orderStatusHistoryId: input.orderStatusHistoryId ?? null,
      status: 'queued',
      nextAttemptAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        marketingEventOutbox.destination,
        marketingEventOutbox.eventName,
        marketingEventOutbox.eventId,
      ],
      set: {
        duplicateCount: sql`${marketingEventOutbox.duplicateCount} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: marketingEventOutbox.id,
      duplicateCount: marketingEventOutbox.duplicateCount,
    });
  return row ? { ...row, duplicated: row.duplicateCount > 0 } : null;
}

async function enqueueOrderDestinations(
  db: Executor,
  input: {
    order: typeof orders.$inferSelect;
    lines: MetaCommerceLine[];
    marketing: StorefrontOrderMarketing;
    requestContext: MetaRequestContext;
    eventId: string;
    eventTime: Date;
    source: string;
    googleEventName: string;
    tiktokEventName: string;
    orderStatusHistoryId?: number | null;
  },
) {
  const clientId =
    normalizeIdentifier(input.marketing.google?.clientId) ??
    normalizeIdentifier(input.order.journeyId) ??
    `order.${input.order.id}`;
  const googlePayload = buildGoogleMeasurementPayload({
    eventName: input.googleEventName,
    eventId: input.eventId,
    orderId: input.order.id,
    eventTime: input.eventTime,
    clientId,
    sessionId: input.marketing.google?.sessionId,
    lines: input.lines,
  });
  const tiktokPayload = buildTikTokEventsPayload({
    eventName: input.tiktokEventName,
    eventId: input.eventId,
    orderId: input.order.id,
    eventTime: input.eventTime,
    eventSourceUrl: input.marketing.eventSourceUrl,
    clickId: input.marketing.tiktok?.clickId,
    cookieId: input.marketing.tiktok?.cookieId,
    clientIpAddress: input.requestContext.clientIpAddress,
    clientUserAgent: input.requestContext.clientUserAgent,
    email: input.order.email,
    phone: input.order.phoneNumber1,
    externalId: input.order.visitId ?? input.order.journeyId ?? input.eventId,
    lines: input.lines,
  });
  const google = isMarketingDestinationConfigured('google')
    ? await insertDestinationEvent(db, {
        destination: 'google',
        eventName: input.googleEventName,
        eventId: input.eventId,
        source: input.source,
        orderId: input.order.id,
        orderStatusHistoryId: input.orderStatusHistoryId,
        eventTime: input.eventTime,
        payload: googlePayload,
      })
    : null;
  const tiktok = isMarketingDestinationConfigured('tiktok')
    ? await insertDestinationEvent(db, {
        destination: 'tiktok',
        eventName: input.tiktokEventName,
        eventId: input.eventId,
        source: input.source,
        orderId: input.order.id,
        orderStatusHistoryId: input.orderStatusHistoryId,
        eventTime: input.eventTime,
        payload: tiktokPayload,
      })
    : null;
  return { google, tiktok };
}

export async function createOrderMarketingArtifacts(
  tx: Transaction,
  input: {
    order: typeof orders.$inferSelect;
    lines: MetaCommerceLine[];
    marketing: StorefrontOrderMarketing;
    requestContext: MetaRequestContext;
    now: Date;
  },
) {
  const acquisition = buildOrderAcquisitionSnapshot(input.marketing, {
    hasMetaClick: Boolean(input.requestContext.fbc?.trim()),
    now: input.now,
  });
  const assistantInfluence = buildOrderAiInfluenceSnapshot({
    marketing: input.marketing,
    orderSessionId: input.order.sessionId,
    lines: input.lines,
    now: input.now,
  });
  const queued = await enqueueOrderDestinations(tx, {
    ...input,
    eventId: input.marketing.eventId,
    eventTime: input.now,
    source: 'order_submission',
    googleEventName: 'purchase',
    tiktokEventName: 'CompletePayment',
  });
  await tx
    .insert(orderMarketingAttribution)
    .values({
      orderId: input.order.id,
      semanticsVersion: MARKETING_SEMANTICS_VERSION,
      eventId: input.marketing.eventId,
      eventSourceUrl: input.marketing.eventSourceUrl,
      googleClientId: normalizeIdentifier(input.marketing.google?.clientId),
      googleSessionId: normalizeIdentifier(input.marketing.google?.sessionId),
      gclid: normalizeIdentifier(input.marketing.google?.gclid),
      gbraid: normalizeIdentifier(input.marketing.google?.gbraid),
      wbraid: normalizeIdentifier(input.marketing.google?.wbraid),
      tiktokClickId: normalizeIdentifier(input.marketing.tiktok?.clickId),
      tiktokCookieId: normalizeIdentifier(input.marketing.tiktok?.cookieId),
      clientIpAddress: input.requestContext.clientIpAddress ?? null,
      clientUserAgent: input.requestContext.clientUserAgent ?? null,
      expiresAt: new Date(input.now.getTime() + ATTRIBUTION_TTL_MS),
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: orderMarketingAttribution.orderId });
  if (acquisition) {
    await tx
      .insert(orderAcquisitionAttribution)
      .values({
        orderId: input.order.id,
        ...acquisition,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing({ target: orderAcquisitionAttribution.orderId });
  }
  await tx
    .insert(orderAiInfluence)
    .values({
      orderId: input.order.id,
      ...assistantInfluence,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: orderAiInfluence.orderId });
  return queued;
}

function attributionToMarketing(
  row: typeof orderMarketingAttribution.$inferSelect,
): StorefrontOrderMarketing {
  return {
    semanticsVersion: MARKETING_SEMANTICS_VERSION,
    eventId: row.eventId,
    eventSourceUrl: row.eventSourceUrl,
    google: {
      clientId: row.googleClientId,
      sessionId: row.googleSessionId,
      gclid: row.gclid,
      gbraid: row.gbraid,
      wbraid: row.wbraid,
    },
    tiktok: { clickId: row.tiktokClickId, cookieId: row.tiktokCookieId },
  };
}

export async function ensureMarketingOrderStatusEvents(
  db: Database,
  input: {
    orderId: number;
    statusHistoryId: number;
    status: number;
    changedAt: Date;
  },
) {
  const kind =
    input.status === 2 ? 'confirmed' : [4, 10].includes(input.status) ? 'completed' : null;
  if (!kind) return { created: false, reason: 'unqualified' as const };
  const [attribution] = await db
    .select()
    .from(orderMarketingAttribution)
    .where(
      and(
        eq(orderMarketingAttribution.orderId, input.orderId),
        eq(orderMarketingAttribution.semanticsVersion, MARKETING_SEMANTICS_VERSION),
      ),
    )
    .limit(1);
  if (!attribution) return { created: false, reason: 'legacy' as const };
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) return { created: false, reason: 'missing_order' as const };
  const rows = await db
    .select()
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, input.orderId));
  const lines = rows.map(lineRowToCommerceLine).filter((line) => Number.isFinite(line.productId));
  if (lines.length === 0) return { created: false, reason: 'missing_lines' as const };
  const eventId =
    kind === 'confirmed'
      ? getOrderConfirmedEventId(input.orderId)
      : getOrderCompletedEventId(input.orderId);
  const queued = await enqueueOrderDestinations(db, {
    order,
    lines,
    marketing: attributionToMarketing(attribution),
    requestContext: {
      clientIpAddress: attribution.clientIpAddress,
      clientUserAgent: attribution.clientUserAgent,
    },
    eventId,
    eventTime: input.changedAt,
    source: kind === 'confirmed' ? 'order_confirmation' : 'order_completion',
    googleEventName: kind === 'confirmed' ? 'order_confirmed' : 'order_completed',
    tiktokEventName: kind === 'confirmed' ? 'OrderConfirmed' : 'OrderCompleted',
    orderStatusHistoryId: input.statusHistoryId,
  });
  return {
    created: Boolean(
      (queued.google && !queued.google.duplicated) || (queued.tiktok && !queued.tiktok.duplicated),
    ),
    eventId,
  };
}

type SendResult =
  | { ok: true; status: number; requestId: string | null; summary: Record<string, unknown> }
  | {
      ok: false;
      retryable: boolean;
      status: number | null;
      retryAfterMs: number | null;
      code: string | null;
      message: string;
    };

function retryAfter(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, timestamp - Date.now());
}

export async function sendMarketingDestinationEvent(row: OutboxRow): Promise<SendResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    let url: string;
    let headers: Record<string, string> = { 'content-type': 'application/json' };
    let body = row.payload;
    if (row.destination === 'google') {
      const measurementId =
        process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID?.trim() ||
        process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
      const apiSecret = process.env.GOOGLE_ANALYTICS_API_SECRET?.trim();
      if (!measurementId || !apiSecret)
        return {
          ok: false,
          retryable: false,
          status: null,
          retryAfterMs: null,
          code: 'destination_unconfigured',
          message: 'Google Analytics Measurement Protocol credentials are not configured.',
        };
      url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    } else if (row.destination === 'tiktok') {
      const pixelId =
        process.env.TIKTOK_PIXEL_ID?.trim() || process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim();
      const accessToken = process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN?.trim();
      if (!pixelId || !accessToken)
        return {
          ok: false,
          retryable: false,
          status: null,
          retryAfterMs: null,
          code: 'destination_unconfigured',
          message: 'TikTok Events API credentials are not configured.',
        };
      url = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';
      headers = { ...headers, 'Access-Token': accessToken };
      body = { ...(row.payload as Record<string, unknown>), event_source_id: pixelId };
    } else {
      return {
        ok: false,
        retryable: false,
        status: null,
        retryAfterMs: null,
        code: 'unknown_destination',
        message: `Unknown destination ${row.destination}.`,
      };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseBody = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const tiktokCode =
      row.destination === 'tiktok' && typeof responseBody.code === 'number' ? responseBody.code : 0;
    if (response.ok && tiktokCode === 0) {
      return {
        ok: true,
        status: response.status,
        requestId:
          response.headers.get('x-request-id') ??
          (typeof responseBody.request_id === 'string' ? responseBody.request_id : null),
        summary: row.destination === 'tiktok' ? { code: tiktokCode } : {},
      };
    }
    return {
      ok: false,
      retryable: response.status === 408 || response.status === 429 || response.status >= 500,
      status: response.status,
      retryAfterMs: retryAfter(response.headers.get('retry-after')),
      code:
        typeof responseBody.code === 'string' || typeof responseBody.code === 'number'
          ? String(responseBody.code)
          : null,
      message:
        typeof responseBody.message === 'string'
          ? responseBody.message
          : `${row.destination} returned HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      status: null,
      retryAfterMs: null,
      code: null,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function claimEvents(db: Database, limit: number) {
  const now = new Date();
  const lease = new Date(now.getTime() + PROCESSING_LEASE_MS);
  const result = await db.execute(sql`
    with candidates as (
      select id from ${marketingEventOutbox}
      where ((${marketingEventOutbox.status} in ('queued', 'retrying') and ${marketingEventOutbox.nextAttemptAt} <= ${now})
        or (${marketingEventOutbox.status} = 'processing' and ${marketingEventOutbox.processingLeaseExpiresAt} < ${now}))
      order by ${marketingEventOutbox.nextAttemptAt} asc, ${marketingEventOutbox.id} asc
      for update skip locked limit ${limit}
    )
    update ${marketingEventOutbox}
    set status = 'processing', attempt_count = ${marketingEventOutbox.attemptCount} + 1,
      processing_started_at = ${now}, processing_lease_expires_at = ${lease}, last_attempt_at = ${now}, updated_at = ${now}
    where id in (select id from candidates) returning id
  `);
  const ids = (result.rows as Array<{ id: number | string }>).map((row) => Number(row.id));
  return ids.length
    ? db.select().from(marketingEventOutbox).where(inArray(marketingEventOutbox.id, ids))
    : [];
}

export async function processMarketingOutboxBatch(db: Database, limit = 50) {
  const rows = await claimEvents(db, Math.max(1, Math.min(limit, 50)));
  const result = {
    claimed: rows.length,
    accepted: 0,
    rejected: 0,
    retrying: 0,
    exhausted: 0,
    dropped: 0,
  };
  for (const row of rows) {
    const maxAge = row.destination === 'google' ? GOOGLE_MAX_AGE_MS : TIKTOK_MAX_AGE_MS;
    if (row.eventTime.getTime() < Date.now() - maxAge) {
      result.dropped += 1;
      await db
        .update(marketingEventOutbox)
        .set({
          status: 'dropped',
          processingLeaseExpiresAt: null,
          errorCode: 'delivery_window_expired',
          errorMessage: 'Event exceeded the destination delivery window.',
          payload: { redacted: true, eventName: row.eventName },
          updatedAt: new Date(),
        })
        .where(eq(marketingEventOutbox.id, row.id));
      continue;
    }
    const sent = await sendMarketingDestinationEvent(row);
    const now = new Date();
    if (sent.ok) {
      result.accepted += 1;
      await db
        .update(marketingEventOutbox)
        .set({
          status: 'accepted',
          deliveredAt: now,
          processingLeaseExpiresAt: null,
          lastHttpStatus: sent.status,
          providerRequestId: sent.requestId,
          responseSummary: sent.summary,
          payload: { redacted: true, eventName: row.eventName },
          updatedAt: now,
        })
        .where(eq(marketingEventOutbox.id, row.id));
      continue;
    }
    const canRetry = sent.retryable && row.attemptCount < MAX_ATTEMPTS;
    if (canRetry) result.retrying += 1;
    else if (sent.retryable) result.exhausted += 1;
    else result.rejected += 1;
    const delay =
      RETRY_DELAYS_MS[Math.min(Math.max(row.attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)];
    await db
      .update(marketingEventOutbox)
      .set({
        status: canRetry ? 'retrying' : sent.retryable ? 'exhausted' : 'rejected',
        nextAttemptAt: canRetry
          ? new Date(now.getTime() + (sent.retryAfterMs ?? delay))
          : row.nextAttemptAt,
        processingLeaseExpiresAt: null,
        lastHttpStatus: sent.status,
        errorCode: sent.code,
        errorMessage: sent.message.slice(0, 2000),
        updatedAt: now,
      })
      .where(eq(marketingEventOutbox.id, row.id));
  }
  return result;
}

export async function reconcileMarketingOrderEvents(db: Database, limit = 100) {
  const result = await db.execute(sql`
    select history.id as history_id, history.order_id, history.status, history.changed_at
    from order_status_history history
    inner join order_marketing_attribution attribution on attribution.order_id = history.order_id
      and attribution.semantics_version = ${MARKETING_SEMANTICS_VERSION}
    where history.status in (2, 4, 10)
      and not exists (
        select 1 from marketing_event_outbox outbox
        where outbox.order_id = history.order_id
          and outbox.source = case when history.status = 2 then 'order_confirmation' else 'order_completion' end
      )
    order by history.changed_at asc, history.id asc
    limit ${Math.max(1, Math.min(limit, 500))}
  `);
  let created = 0;
  for (const row of result.rows as Array<{
    history_id: number | string;
    order_id: number | string;
    status: number;
    changed_at: Date | string;
  }>) {
    const outcome = await ensureMarketingOrderStatusEvents(db, {
      orderId: Number(row.order_id),
      statusHistoryId: Number(row.history_id),
      status: Number(row.status),
      changedAt: row.changed_at instanceof Date ? row.changed_at : new Date(row.changed_at),
    });
    if (outcome.created) created += 1;
  }
  return { marketingScanned: result.rows.length, marketingCreated: created };
}

export async function clearExpiredMarketingAttribution(db: Database) {
  const now = new Date();
  const cleared = await db
    .update(orderMarketingAttribution)
    .set({
      googleClientId: null,
      googleSessionId: null,
      gclid: null,
      gbraid: null,
      wbraid: null,
      tiktokClickId: null,
      tiktokCookieId: null,
      clientIpAddress: null,
      clientUserAgent: null,
      updatedAt: now,
    })
    .where(
      sql`
    ${orderMarketingAttribution.expiresAt} <= ${now}
    and (
      ${orderMarketingAttribution.googleClientId} is not null
      or ${orderMarketingAttribution.googleSessionId} is not null
      or ${orderMarketingAttribution.gclid} is not null
      or ${orderMarketingAttribution.gbraid} is not null
      or ${orderMarketingAttribution.wbraid} is not null
      or ${orderMarketingAttribution.tiktokClickId} is not null
      or ${orderMarketingAttribution.tiktokCookieId} is not null
      or ${orderMarketingAttribution.clientIpAddress} is not null
      or ${orderMarketingAttribution.clientUserAgent} is not null
    )
  `,
    )
    .returning({ orderId: orderMarketingAttribution.orderId });
  return { marketingAttributionCleared: cleared.length };
}
