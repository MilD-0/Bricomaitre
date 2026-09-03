import { timingSafeEqual } from 'node:crypto';

import { getTrustedClientIp } from '@bric/runtime/client-ip';
import type { NextRequest } from 'next/server';

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function configuredStorefrontHosts() {
  const hosts = new Set(['localhost', '127.0.0.1', 'bricomaitre.com', 'www.bricomaitre.com']);
  for (const value of [
    process.env.STOREFRONT_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
  ]) {
    if (!value?.trim()) continue;
    try {
      hosts.add(new URL(value).hostname.toLowerCase());
    } catch {
      // Invalid optional URLs are reported by health/config checks elsewhere.
    }
  }
  return hosts;
}

export function isAllowedMetaSourceUrl(value: string) {
  try {
    const url = new URL(value);
    const allowedProtocol =
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    return allowedProtocol && configuredStorefrontHosts().has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function hasTrustedStorefrontProxySecret(request: NextRequest) {
  const configured = process.env.STOREFRONT_META_PROXY_SECRET?.trim();
  const supplied = request.headers.get('x-storefront-meta-proxy-secret')?.trim();
  return Boolean(configured && supplied && safeEqual(configured, supplied));
}

export function authorizeMetaSourceRequest(request: NextRequest, eventSourceUrl: string) {
  if (!isAllowedMetaSourceUrl(eventSourceUrl)) return false;
  if (hasTrustedStorefrontProxySecret(request)) return true;

  const origin = request.headers.get('origin');
  const host =
    request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    request.headers.get('host')?.trim();
  if (!origin || !host) return false;
  try {
    return (
      new URL(origin).host.toLowerCase() === host.toLowerCase() &&
      new URL(eventSourceUrl).host.toLowerCase() === host.toLowerCase()
    );
  } catch {
    return false;
  }
}

function buildFbcFromSourceUrl(eventSourceUrl: string | null | undefined, now = new Date()) {
  if (!eventSourceUrl) return null;
  try {
    const fbclid = new URL(eventSourceUrl).searchParams.get('fbclid')?.trim().slice(0, 500);
    return fbclid ? `fb.1.${Math.floor(now.getTime() / 1000)}.${fbclid}` : null;
  } catch {
    return null;
  }
}

export function getMetaRequestContext(request: NextRequest, eventSourceUrl?: string | null) {
  const clientIpAddress = getTrustedClientIp(request.headers);
  return {
    clientIpAddress,
    clientUserAgent: request.headers.get('user-agent'),
    fbc: request.cookies.get('_fbc')?.value ?? buildFbcFromSourceUrl(eventSourceUrl),
    fbp: request.cookies.get('_fbp')?.value ?? null,
    externalIdSource: request.cookies.get('bric_visit_id')?.value ?? null,
  };
}
