import {
  marketingEventOutbox,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orderLineItems,
  orderMarketingAttribution,
  orders,
} from '@bric/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { ORDER_STATUS } from '../../orders-support';
import { MARKETING_SEMANTICS_VERSION, type StorefrontOrderMarketing } from '../marketing-contracts';
import {
  getOrderCompletedEventId,
  getOrderConfirmedEventId,
  lineRowToCommerceLine,
  type MetaCommerceLine,
  type MetaRequestContext,
} from '../meta';
import { buildOrderAcquisitionSnapshot, buildOrderAiInfluenceSnapshot } from './attribution';
import {
  ATTRIBUTION_TTL_MS,
  GOOGLE_MAX_AGE_MS,
  TIKTOK_MAX_AGE_MS,
  type Database,
  type Destination,
  type Executor,
  type Transaction,
} from './contract';
import {
  buildGoogleMeasurementPayload,
  buildTikTokEventsPayload,
  isMarketingDestinationConfigured,
  normalizeIdentifier,
} from './payloads';

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
  const google =
    isMarketingDestinationConfigured('google') &&
    input.eventTime.getTime() >= Date.now() - GOOGLE_MAX_AGE_MS
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
  const tiktok =
    isMarketingDestinationConfigured('tiktok') &&
    input.eventTime.getTime() >= Date.now() - TIKTOK_MAX_AGE_MS
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
    input.status === ORDER_STATUS.CONFIRMED
      ? 'confirmed'
      : input.status === ORDER_STATUS.COMPLETED || input.status === ORDER_STATUS.MANUAL_COMPLETED
        ? 'completed'
        : null;
  if (!kind) return { created: false, reason: 'unqualified' as const };
  if (input.changedAt.getTime() < Date.now() - Math.max(GOOGLE_MAX_AGE_MS, TIKTOK_MAX_AGE_MS)) {
    return { created: false, reason: 'expired' as const };
  }
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
