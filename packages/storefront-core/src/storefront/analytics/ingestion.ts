import { analyticsEvents, analyticsJourneys } from '@bric/db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import {
  type Database,
  type StorefrontAnalyticsEvent,
  storefrontAnalyticsEventSchema,
} from './contract';
import { buildStoredAnalyticsMetadata } from './metadata';
import { upsertPaidClickVisit } from './paid-clicks';
import { upsertAnalyticsSession } from './sessions';

// One engagement per product per event. Cart quantities do not multiply checkout
// starts, and legacy top-level IDs remain supported without double counting.
export function analyticsEventProductIdsSql() {
  return sql`lateral (
    select distinct product_id from (
      select ${analyticsEvents.productId} as product_id
      union all
      select case when item->>'productId' ~ '^[0-9]{1,16}$'
        then case when (item->>'productId')::numeric between 1 and 9007199254740991
          then (item->>'productId')::bigint end end
      from jsonb_array_elements(case
        when ${analyticsEvents.eventName} = 'begin_checkout'
          and jsonb_typeof(${analyticsEvents.metadata}->'items') = 'array'
        then ${analyticsEvents.metadata}->'items' else '[]'::jsonb end) item
    ) attributed where product_id is not null
  )`;
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
          lastSeenAt: sql`greatest(${analyticsJourneys.lastSeenAt}, ${occurredAt})`,
          lastPath: event.pagePath ?? sql`${analyticsJourneys.lastPath}`,
          locale: event.locale ?? sql`${analyticsJourneys.locale}`,
          referrer: sql`coalesce(${analyticsJourneys.referrer}, ${event.referrer})`,
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

    await upsertAnalyticsSession(tx, event, occurredAt);
    await upsertPaidClickVisit(tx, event, occurredAt);

    if (event.eventName === 'purchase') {
      await tx
        .update(analyticsJourneys)
        .set({
          orderCount: sql`${analyticsJourneys.orderCount} + 1`,
          purchaseCount: sql`${analyticsJourneys.purchaseCount} + 1`,
          firstOrderId: sql`coalesce(${analyticsJourneys.firstOrderId}, ${event.orderId})`,
        })
        .where(eq(analyticsJourneys.id, event.journeyId));
    }

    return { ok: true as const, deduped: false };
  });
}

export function buildAnalyticsDateWhere(filters: {
  startDate?: string | null;
  endDate?: string | null;
}) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(
      gte(analyticsEvents.occurredAt, new Date(`${filters.startDate}T00:00:00.000Z`)),
    );
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
