'use client';

import {
  MARKETING_SEMANTICS_VERSION,
  storefrontOrderMarketingSchema,
  type StorefrontOrderMarketing,
} from '@bric/storefront-core/marketing-contracts';
import { z } from 'zod';

const STORAGE_KEY = 'bric:marketing:attribution:v1';
const attributionSchema = z.object({
  gclid: z.string().max(250).nullable(),
  gbraid: z.string().max(250).nullable(),
  wbraid: z.string().max(250).nullable(),
  ttclid: z.string().max(250).nullable(),
}).strict();

function cookie(name: string) {
  const prefix = `${name}=`;
  const match = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix));
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
    const parsed = attributionSchema.safeParse(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'));
    return parsed.success ? parsed.data : { gclid: null, gbraid: null, wbraid: null, ttclid: null };
  } catch {
    return { gclid: null, gbraid: null, wbraid: null, ttclid: null };
  }
}

export function captureMarketingAttribution() {
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
