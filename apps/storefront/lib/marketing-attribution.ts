'use client';

import {
  MARKETING_SEMANTICS_VERSION,
  storefrontAcquisitionTouchSchema,
  storefrontOrderMarketingSchema,
  type StorefrontAcquisitionTouch,
  type StorefrontOrderMarketing,
} from '@bric/storefront-core/marketing-contracts';
import { classifyAcquisition, isNonDirectAcquisition } from '@bric/storefront-core/acquisition';
import { z } from 'zod';

import { getAssistantOrderInfluence } from '@/lib/assistant-attribution';

const STORAGE_KEY = 'bric:marketing:attribution:v1';
const STOREFRONT_ATTRIBUTION_KEY = 'bric:storefront:attribution:v1';
const JOURNEY_KEY = 'bric:analytics:journey:v1';
const SESSION_KEY = 'bric:analytics:session:v2';
const LAST_NON_DIRECT_TOUCH_KEY = 'bric:analytics:last-non-direct:v1';
const ATTRIBUTION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const SESSION_INACTIVITY_MS = 30 * 60 * 1000;
const LAST_NON_DIRECT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
let documentEntryCaptured = false;
const attributionSchema = z
  .object({
    gclid: z.string().max(250).nullable(),
    gbraid: z.string().max(250).nullable(),
    wbraid: z.string().max(250).nullable(),
    ttclid: z.string().max(250).nullable(),
  })
  .strict();

const storefrontAttributionSchema = z
  .object({
    visitId: z.string().trim().min(1).max(120),
    landingUrl: z.string().url().max(2048),
    landingHost: z.string().trim().min(1).max(255),
    fbclid: z.string().trim().min(1).max(500).nullable(),
    fbc: z.string().trim().min(1).max(750).nullable(),
    utmSource: z.string().trim().min(1).max(120).nullable(),
    utmMedium: z.string().trim().min(1).max(120).nullable(),
    utmCampaign: z.string().trim().min(1).max(180).nullable(),
    utmTerm: z.string().trim().min(1).max(180).nullable(),
    utmContent: z.string().trim().min(1).max(180).nullable(),
    capturedAt: z.number().int().positive(),
  })
  .strict();

const analyticsSessionSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    journeyId: z.string().trim().min(1).max(120),
    startedAt: z.number().int().positive(),
    lastSeenAt: z.number().int().positive(),
    campaignFingerprint: z.string().max(2048).nullable(),
    entry: storefrontAcquisitionTouchSchema,
  })
  .strict();

export type StorefrontAttribution = z.infer<typeof storefrontAttributionSchema>;

function createId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
  );
}

function trimmedQueryValue(query: URLSearchParams, name: string, max: number) {
  const value = query.get(name)?.trim();
  return value ? value.slice(0, max) : null;
}

function sanitizedReferrer(value: string, currentOrigin: string) {
  if (!value) return null;
  try {
    const referrer = new URL(value);
    return referrer.origin === currentOrigin
      ? `${referrer.origin}${referrer.pathname}`
      : referrer.origin;
  } catch {
    return null;
  }
}

function currentAcquisitionTouch(input: {
  sessionId: string;
  journeyId: string;
  capturedAt: number;
  includeDocumentReferrer: boolean;
}): StorefrontAcquisitionTouch {
  const currentUrl = new URL(window.location.href);
  const query = currentUrl.searchParams;
  return storefrontAcquisitionTouchSchema.parse({
    sessionId: input.sessionId,
    journeyId: input.journeyId,
    landingPath: currentUrl.pathname,
    referrer: input.includeDocumentReferrer
      ? sanitizedReferrer(document.referrer, currentUrl.origin)
      : null,
    utmSource: trimmedQueryValue(query, 'utm_source', 120),
    utmMedium: trimmedQueryValue(query, 'utm_medium', 120),
    utmCampaign: trimmedQueryValue(query, 'utm_campaign', 180),
    utmTerm: trimmedQueryValue(query, 'utm_term', 180),
    utmContent: trimmedQueryValue(query, 'utm_content', 180),
    hasMetaClickId: Boolean(trimmedQueryValue(query, 'fbclid', 500)),
    hasGoogleClickId: Boolean(
      trimmedQueryValue(query, 'gclid', 250) ||
      trimmedQueryValue(query, 'gbraid', 250) ||
      trimmedQueryValue(query, 'wbraid', 250),
    ),
    hasTikTokClickId: Boolean(trimmedQueryValue(query, 'ttclid', 250)),
    capturedAt: new Date(input.capturedAt).toISOString(),
  });
}

function getOrCreateJourneyId() {
  try {
    const current = window.localStorage.getItem(JOURNEY_KEY)?.trim();
    if (current) return current.slice(0, 120);
    const next = createId();
    window.localStorage.setItem(JOURNEY_KEY, next);
    return next;
  } catch {
    return createId();
  }
}

function readSession() {
  try {
    const parsed = analyticsSessionSchema.safeParse(
      JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? 'null'),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readLastNonDirectTouch(now: number) {
  try {
    const parsed = storefrontAcquisitionTouchSchema.safeParse(
      JSON.parse(window.localStorage.getItem(LAST_NON_DIRECT_TOUCH_KEY) ?? 'null'),
    );
    if (parsed.success && now - Date.parse(parsed.data.capturedAt) <= LAST_NON_DIRECT_MAX_AGE_MS) {
      return parsed.data;
    }
  } catch {
    // Invalid attribution state is discarded below.
  }
  return null;
}

function hasCampaignQuery(url: URL) {
  return ['fbclid', 'gclid', 'gbraid', 'wbraid', 'ttclid', 'utm_source', 'utm_medium'].some(
    (name) => Boolean(url.searchParams.get(name)?.trim()),
  );
}

export function getStorefrontAnalyticsContext(now = Date.now()) {
  const currentUrl = new URL(window.location.href);
  const journeyId = getOrCreateJourneyId();
  const stored = readSession();
  const campaignFingerprint = hasCampaignQuery(currentUrl) ? sanitizedLandingUrl(currentUrl) : null;
  const expired = !stored || now - stored.lastSeenAt > SESSION_INACTIVITY_MS;
  const changedCampaign = Boolean(
    stored && campaignFingerprint && campaignFingerprint !== stored.campaignFingerprint,
  );
  const startsNewSession = expired || changedCampaign;
  const sessionId = startsNewSession ? createId() : stored.id;
  const entry = startsNewSession
    ? currentAcquisitionTouch({
        sessionId,
        journeyId,
        capturedAt: now,
        includeDocumentReferrer: !documentEntryCaptured,
      })
    : stored.entry;
  documentEntryCaptured = true;
  const next = analyticsSessionSchema.parse({
    id: sessionId,
    journeyId,
    startedAt: startsNewSession ? now : stored.startedAt,
    lastSeenAt: now,
    campaignFingerprint: startsNewSession ? campaignFingerprint : stored.campaignFingerprint,
    entry,
  });

  const classification = classifyAcquisition(entry);
  let lastNonDirectTouch = readLastNonDirectTouch(now);
  if (startsNewSession && isNonDirectAcquisition(classification.channel)) {
    lastNonDirectTouch = entry;
  }

  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    if (lastNonDirectTouch) {
      window.localStorage.setItem(LAST_NON_DIRECT_TOUCH_KEY, JSON.stringify(lastNonDirectTouch));
    } else {
      window.localStorage.removeItem(LAST_NON_DIRECT_TOUCH_KEY);
    }
  } catch {
    // Analytics identity is best-effort and never blocks navigation.
  }

  return {
    journeyId,
    sessionId,
    sessionStartedAt: next.startedAt,
    isNewSession: startsNewSession,
    entry,
    lastNonDirectTouch,
    classification,
  };
}

function writeCookie(name: string, value: string) {
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ATTRIBUTION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
  } catch {
    // Cookie storage is best-effort and never blocks commerce interactions.
  }
}

export function buildMetaClickCookie(fbclid: string, capturedAt: number) {
  return `fb.1.${Math.floor(capturedAt / 1000)}.${fbclid}`;
}

function sanitizedLandingUrl(url: URL) {
  const landing = new URL(url.pathname, url.origin);
  const fields = [
    ['fbclid', 500],
    ['utm_source', 120],
    ['utm_medium', 120],
    ['utm_campaign', 180],
    ['utm_term', 180],
    ['utm_content', 180],
    ['gclid', 250],
    ['gbraid', 250],
    ['wbraid', 250],
    ['ttclid', 250],
  ] as const;
  for (const [name, max] of fields) {
    const value = trimmedQueryValue(url.searchParams, name, max);
    if (value) landing.searchParams.set(name, value);
  }
  return landing.toString();
}

function readStorefrontAttribution(now: number) {
  try {
    const parsed = storefrontAttributionSchema.safeParse(
      JSON.parse(window.localStorage.getItem(STOREFRONT_ATTRIBUTION_KEY) ?? 'null'),
    );
    if (parsed.success && now - parsed.data.capturedAt <= ATTRIBUTION_MAX_AGE_SECONDS * 1000)
      return parsed.data;
  } catch {
    // Invalid attribution state is replaced below.
  }
  return null;
}

export function captureStorefrontAttribution(now = Date.now()): StorefrontAttribution {
  const currentUrl = new URL(window.location.href);
  const query = currentUrl.searchParams;
  const currentFbclid = trimmedQueryValue(query, 'fbclid', 500);
  const stored = readStorefrontAttribution(now);
  const currentLandingUrl = sanitizedLandingUrl(currentUrl);
  const hasCampaignQuery = Boolean(
    currentFbclid ||
    trimmedQueryValue(query, 'utm_source', 120) ||
    trimmedQueryValue(query, 'gclid', 250) ||
    trimmedQueryValue(query, 'gbraid', 250) ||
    trimmedQueryValue(query, 'wbraid', 250) ||
    trimmedQueryValue(query, 'ttclid', 250),
  );
  const startsNewVisit = Boolean(hasCampaignQuery && currentLandingUrl !== stored?.landingUrl);
  const capturedAt = startsNewVisit || !stored ? now : stored.capturedAt;
  const fbc = currentFbclid
    ? buildMetaClickCookie(currentFbclid, capturedAt)
    : (cookie('_fbc') ?? stored?.fbc ?? null);
  const next = storefrontAttributionSchema.parse(
    startsNewVisit || !stored
      ? {
          visitId: createId(),
          landingUrl: currentLandingUrl,
          landingHost: currentUrl.host,
          fbclid: currentFbclid,
          fbc,
          utmSource: trimmedQueryValue(query, 'utm_source', 120),
          utmMedium: trimmedQueryValue(query, 'utm_medium', 120),
          utmCampaign: trimmedQueryValue(query, 'utm_campaign', 180),
          utmTerm: trimmedQueryValue(query, 'utm_term', 180),
          utmContent: trimmedQueryValue(query, 'utm_content', 180),
          capturedAt,
        }
      : { ...stored, fbc },
  );

  try {
    window.localStorage.setItem(STOREFRONT_ATTRIBUTION_KEY, JSON.stringify(next));
  } catch {
    // Attribution storage is best-effort and never blocks navigation.
  }
  writeCookie('bric_visit_id', next.visitId);
  if (next.fbc && (currentFbclid || !cookie('_fbc'))) writeCookie('_fbc', next.fbc);
  return next;
}

function cookie(name: string) {
  const prefix = `${name}=`;
  const match = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export function parseGoogleClientId(value: string | null) {
  if (!value) return null;
  const parts = value.split('.');
  return parts.length >= 4 ? parts.slice(-2).join('.') : null;
}

export function parseGoogleSessionId(value: string | null) {
  if (!value) return null;
  const sessionToken = value.match(/(?:^|\.)s(\d+)/)?.[1];
  if (sessionToken) return sessionToken;
  const parts = value.split('.');
  return parts.length >= 3 && /^\d+$/.test(parts[2]) ? parts[2] : null;
}

function readStoredAttribution() {
  try {
    const parsed = attributionSchema.safeParse(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'),
    );
    return parsed.success ? parsed.data : { gclid: null, gbraid: null, wbraid: null, ttclid: null };
  } catch {
    return { gclid: null, gbraid: null, wbraid: null, ttclid: null };
  }
}

export function captureMarketingAttribution() {
  captureStorefrontAttribution();
  getStorefrontAnalyticsContext();
  const current = readStoredAttribution();
  const query = new URLSearchParams(window.location.search);
  const next = attributionSchema.parse({
    gclid: query.get('gclid')?.slice(0, 250) || current.gclid,
    gbraid: query.get('gbraid')?.slice(0, 250) || current.gbraid,
    wbraid: query.get('wbraid')?.slice(0, 250) || current.wbraid,
    ttclid: query.get('ttclid')?.slice(0, 250) || current.ttclid,
  });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Attribution storage is best-effort and never blocks navigation.
  }
  return next;
}

function googleSessionCookieName(measurementId: string | undefined) {
  const suffix = measurementId?.replace(/^G-/, '').replace(/[^A-Z0-9]/gi, '_');
  return suffix ? `_ga_${suffix}` : null;
}

export function getMarketingOrderContext(eventId: string): StorefrontOrderMarketing {
  const storefrontAttribution = captureStorefrontAttribution();
  const attribution = captureMarketingAttribution();
  const analytics = getStorefrontAnalyticsContext();
  const sessionCookieName = googleSessionCookieName(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  return storefrontOrderMarketingSchema.parse({
    semanticsVersion: MARKETING_SEMANTICS_VERSION,
    eventId,
    eventSourceUrl: window.location.href,
    sessionEntry: analytics.entry,
    ...(analytics.lastNonDirectTouch ? { lastNonDirectTouch: analytics.lastNonDirectTouch } : {}),
    assistant:
      getAssistantOrderInfluence({
        journeyId: analytics.journeyId,
        sessionId: analytics.sessionId,
      }) ?? undefined,
    acquisition: {
      landingPath: new URL(storefrontAttribution.landingUrl).pathname,
      utmSource: storefrontAttribution.utmSource,
      utmMedium: storefrontAttribution.utmMedium,
      utmCampaign: storefrontAttribution.utmCampaign,
      utmTerm: storefrontAttribution.utmTerm,
      utmContent: storefrontAttribution.utmContent,
      capturedAt: new Date(storefrontAttribution.capturedAt).toISOString(),
    },
    google: {
      clientId: parseGoogleClientId(cookie('_ga')),
      sessionId: parseGoogleSessionId(sessionCookieName ? cookie(sessionCookieName) : null),
      gclid: attribution.gclid,
      gbraid: attribution.gbraid,
      wbraid: attribution.wbraid,
    },
    tiktok: {
      clickId: attribution.ttclid,
      cookieId: cookie('_ttp'),
    },
  });
}
