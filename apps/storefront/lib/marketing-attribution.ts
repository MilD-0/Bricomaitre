'use client';

import {
  MARKETING_SEMANTICS_VERSION,
  storefrontOrderMarketingSchema,
  type StorefrontOrderMarketing,
} from '@bric/storefront-core/marketing-contracts';
import { z } from 'zod';

const STORAGE_KEY = 'bric:marketing:attribution:v1';
const STOREFRONT_ATTRIBUTION_KEY = 'bric:storefront:attribution:v1';
const ATTRIBUTION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
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
  const hasCampaignQuery = Boolean(currentFbclid || trimmedQueryValue(query, 'utm_source', 120));
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
  const attribution = captureMarketingAttribution();
  const sessionCookieName = googleSessionCookieName(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);
  return storefrontOrderMarketingSchema.parse({
    semanticsVersion: MARKETING_SEMANTICS_VERSION,
    eventId,
    eventSourceUrl: window.location.href,
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
