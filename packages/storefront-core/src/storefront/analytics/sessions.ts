import { analyticsSessions } from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import { classifyAcquisition } from '../acquisition';
import {
  ANALYTICS_CLIENT_TIMESTAMP_MAX_AGE_MS,
  type Database,
  type StorefrontAnalyticsEvent,
} from './contract';

export function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getMetadataBoolean(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'boolean' ? value : null;
}

function getSessionStartedAt(event: StorefrontAnalyticsEvent, occurredAt: Date) {
  const value = getMetadataString(event.metadata, 'sessionStartedAt');
  const parsed = value ? Date.parse(value) : Number.NaN;
  if (
    !Number.isFinite(parsed) ||
    parsed > occurredAt.getTime() ||
    parsed < occurredAt.getTime() - ANALYTICS_CLIENT_TIMESTAMP_MAX_AGE_MS
  ) {
    return occurredAt;
  }
  return new Date(parsed);
}

function getReferrerDomain(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

export function classifyEventAcquisition(event: StorefrontAnalyticsEvent) {
  return classifyAcquisition({
    utmSource: event.utmSource,
    utmMedium: event.utmMedium,
    referrer: event.referrer,
    hasMetaClickId: getMetadataBoolean(event.metadata, 'hasMetaClickId') === true,
    hasGoogleClickId: getMetadataBoolean(event.metadata, 'hasGoogleClickId') === true,
    hasTikTokClickId: getMetadataBoolean(event.metadata, 'hasTikTokClickId') === true,
  });
}

export async function upsertAnalyticsSession(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  event: StorefrontAnalyticsEvent,
  occurredAt: Date,
) {
  const startedAt = getSessionStartedAt(event, occurredAt);
  const classification = classifyEventAcquisition(event);
  const earlierEntry = sql`${analyticsSessions.startedAt} > ${startedAt}`;
  const now = new Date();
  await tx
    .insert(analyticsSessions)
    .values({
      id: event.sessionId,
      journeyId: event.journeyId,
      visitId: event.visitId,
      startedAt,
      lastSeenAt: occurredAt,
      entryPath: event.pagePath ?? '/',
      referrerDomain: getReferrerDomain(event.referrer),
      utmSource: event.utmSource,
      utmMedium: event.utmMedium,
      utmCampaign: event.utmCampaign,
      utmTerm: event.utmTerm,
      utmContent: event.utmContent,
      channel: classification.channel,
      evidence: classification.evidence,
      hasMetaClickId: getMetadataBoolean(event.metadata, 'hasMetaClickId') === true,
      hasGoogleClickId: getMetadataBoolean(event.metadata, 'hasGoogleClickId') === true,
      hasTikTokClickId: getMetadataBoolean(event.metadata, 'hasTikTokClickId') === true,
      locale: event.locale,
      viewportClass: getMetadataString(event.metadata, 'viewportClass'),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: analyticsSessions.id,
      set: {
        startedAt: sql`least(${analyticsSessions.startedAt}, ${startedAt})`,
        lastSeenAt: sql`greatest(${analyticsSessions.lastSeenAt}, ${occurredAt})`,
        visitId: sql`case when ${earlierEntry} then ${event.visitId} else ${analyticsSessions.visitId} end`,
        entryPath: sql`case when ${earlierEntry} then ${event.pagePath ?? '/'} else ${analyticsSessions.entryPath} end`,
        referrerDomain: sql`case when ${earlierEntry} then ${getReferrerDomain(event.referrer)} else ${analyticsSessions.referrerDomain} end`,
        utmSource: sql`case when ${earlierEntry} then ${event.utmSource} else ${analyticsSessions.utmSource} end`,
        utmMedium: sql`case when ${earlierEntry} then ${event.utmMedium} else ${analyticsSessions.utmMedium} end`,
        utmCampaign: sql`case when ${earlierEntry} then ${event.utmCampaign} else ${analyticsSessions.utmCampaign} end`,
        utmTerm: sql`case when ${earlierEntry} then ${event.utmTerm} else ${analyticsSessions.utmTerm} end`,
        utmContent: sql`case when ${earlierEntry} then ${event.utmContent} else ${analyticsSessions.utmContent} end`,
        channel: sql`case when ${earlierEntry} then ${classification.channel} else ${analyticsSessions.channel} end`,
        evidence: sql`case when ${earlierEntry} then ${classification.evidence} else ${analyticsSessions.evidence} end`,
        hasMetaClickId: sql`case when ${earlierEntry} then ${getMetadataBoolean(event.metadata, 'hasMetaClickId') === true} else ${analyticsSessions.hasMetaClickId} end`,
        hasGoogleClickId: sql`case when ${earlierEntry} then ${getMetadataBoolean(event.metadata, 'hasGoogleClickId') === true} else ${analyticsSessions.hasGoogleClickId} end`,
        hasTikTokClickId: sql`case when ${earlierEntry} then ${getMetadataBoolean(event.metadata, 'hasTikTokClickId') === true} else ${analyticsSessions.hasTikTokClickId} end`,
        locale: sql`case when ${earlierEntry} then ${event.locale} else coalesce(${analyticsSessions.locale}, ${event.locale}) end`,
        viewportClass: sql`case when ${earlierEntry} then ${getMetadataString(event.metadata, 'viewportClass')} else coalesce(${analyticsSessions.viewportClass}, ${getMetadataString(event.metadata, 'viewportClass')}) end`,
        updatedAt: now,
      },
    });
}
