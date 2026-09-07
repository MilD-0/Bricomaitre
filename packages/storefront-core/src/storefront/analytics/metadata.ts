import { type StorefrontAnalyticsEvent } from './contract';
import { classifyEventAcquisition, getMetadataString } from './sessions';

function compactMetaTracking(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const tracking = value as Record<string, unknown>;
  const pixel =
    tracking.pixel && typeof tracking.pixel === 'object' && !Array.isArray(tracking.pixel)
      ? (tracking.pixel as Record<string, unknown>)
      : {};
  const capi =
    tracking.capi && typeof tracking.capi === 'object' && !Array.isArray(tracking.capi)
      ? (tracking.capi as Record<string, unknown>)
      : {};

  return {
    ...(typeof tracking.eventName === 'string' ? { eventName: tracking.eventName } : {}),
    ...(typeof tracking.eventId === 'string' ? { eventId: tracking.eventId } : {}),
    ...(typeof tracking.eventTime === 'number' || typeof tracking.eventTime === 'string'
      ? { eventTime: tracking.eventTime }
      : {}),
    pixel: {
      invoked: pixel.invoked === true || pixel.fired === true,
    },
    capi: {
      queued: capi.queued === true,
      attempted: capi.attempted === true,
      ...(typeof capi.status === 'number' ? { status: capi.status } : {}),
      ...(typeof capi.ok === 'boolean' ? { ok: capi.ok } : {}),
    },
  };
}

export function buildStoredAnalyticsMetadata(event: StorefrontAnalyticsEvent) {
  const metadata = { ...event.metadata };
  const metaTracking = metadata.metaTracking;
  for (const key of [
    'landingUrl',
    'landingHost',
    'userAgent',
    'fbc',
    'paidClickSeenAt',
    'paidClickCookie',
    'title',
    'storefrontVariant',
    'requestedVariant',
    'experimentMode',
    'experimentSource',
    'metaTracking',
  ] as const) {
    delete metadata[key];
  }
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
    return new URL(pagePath, 'https://bricomaitre.com');
  } catch {
    return null;
  }
}

export function getEventPageUrl(event: StorefrontAnalyticsEvent) {
  return getPageUrl(getMetadataString(event.metadata, 'landingUrl')) ?? getPageUrl(event.pagePath);
}

export function getLandingQuery(url: URL | null) {
  if (!url) {
    return {};
  }

  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    query[key] = value;
  }

  return query;
}

export function classifyPaidSource(event: StorefrontAnalyticsEvent) {
  const classification = classifyEventAcquisition(event);
  if (classification.channel === 'meta_paid') return 'meta_utm' as const;
  if (classification.channel === 'google_paid') return 'google_click' as const;
  if (classification.evidence === 'tiktok_click_id') return 'tiktok_click' as const;
  return null;
}
