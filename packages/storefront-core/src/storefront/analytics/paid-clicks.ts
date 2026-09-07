import { analyticsPaidClickVisits } from '@bric/db/schema';
import { eq, sql } from 'drizzle-orm';
import { type Database, type StorefrontAnalyticsEvent } from './contract';
import { classifyPaidSource, getEventPageUrl, getLandingQuery } from './metadata';
import { getMetadataString } from './sessions';

export async function upsertPaidClickVisit(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
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
  const shouldCreate =
    (event.eventName === 'session_start' || event.eventName === 'page_view') && paidSource;

  if (shouldCreate) {
    const pageUrl = getEventPageUrl(event);
    const fbclidRaw = pageUrl?.searchParams.get('fbclid')?.trim() || null;
    const purchaseCount = event.eventName === 'purchase' ? 1 : 0;

    await tx
      .insert(analyticsPaidClickVisits)
      .values({
        visitId,
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
        landingUrl:
          getMetadataString(metadata, 'landingUrl') ?? pageUrl?.toString() ?? event.pagePath ?? '/',
        landingPath: pageUrl?.pathname || '/',
        landingQuery: getLandingQuery(pageUrl),
        landingHost: getMetadataString(metadata, 'landingHost') ?? pageUrl?.host ?? null,
        referrer: event.referrer,
        userAgent: getMetadataString(metadata, 'userAgent'),
        fbclidRaw,
        fbc: getMetadataString(metadata, 'fbc'),
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
          lastSeenAt: sql`greatest(${analyticsPaidClickVisits.lastSeenAt}, ${occurredAt})`,
          referrer: event.referrer ?? sql`${analyticsPaidClickVisits.referrer}`,
          fbclidRaw: fbclidRaw ?? sql`${analyticsPaidClickVisits.fbclidRaw}`,
          fbc: getMetadataString(metadata, 'fbc') ?? sql`${analyticsPaidClickVisits.fbc}`,
          utmSource: sql`coalesce(${analyticsPaidClickVisits.utmSource}, ${event.utmSource})`,
          utmMedium: sql`coalesce(${analyticsPaidClickVisits.utmMedium}, ${event.utmMedium})`,
          utmCampaign: sql`coalesce(${analyticsPaidClickVisits.utmCampaign}, ${event.utmCampaign})`,
          utmTerm: sql`coalesce(${analyticsPaidClickVisits.utmTerm}, ${event.utmTerm})`,
          utmContent: sql`coalesce(${analyticsPaidClickVisits.utmContent}, ${event.utmContent})`,
          paidSource,
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

  const purchaseCount = event.eventName === 'purchase' ? 1 : 0;
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
