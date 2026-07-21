import { signInternalRequest } from '@bric/runtime/internal-signing';

import { getStorefrontApiBaseUrl } from './storefront-api';

const DEFAULT_STOREFRONT_BASE_URL = 'http://localhost:3002';
const REVALIDATE_TIMEOUT_MS = 2_000;
const REVALIDATE_PATH = '/api/internal/revalidate';

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getStorefrontBaseUrl() {
  return normalizeBaseUrl(process.env.STOREFRONT_BASE_URL ?? DEFAULT_STOREFRONT_BASE_URL);
}

export function getStorefrontNewBaseUrl() {
  const value = process.env.STOREFRONT_NEW_BASE_URL?.trim();
  return value ? normalizeBaseUrl(value) : null;
}

function getStorefrontRevalidateSecret() {
  return process.env.STOREFRONT_REVALIDATE_SECRET?.trim() ?? '';
}

async function postSignedRevalidationRequest(baseUrl: string, bodyText: string, secret: string) {
  const timestamp = String(Date.now());
  const signature = signInternalRequest(bodyText, secret, timestamp);
  const response = await fetch(`${baseUrl}${REVALIDATE_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-revalidate-timestamp': timestamp,
      'x-revalidate-signature': signature,
    },
    body: bodyText,
    cache: 'no-store',
    signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Revalidation failed for ${baseUrl}: ${response.status}`);
  }
}

export async function revalidateStorefrontAssets() {
  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn('[admin] storefront asset revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured');
    return;
  }

  const bodyText = JSON.stringify({ scope: 'assets' });
  const targets = [...new Set([
    getStorefrontApiBaseUrl(),
    getStorefrontBaseUrl(),
    getStorefrontNewBaseUrl(),
  ].filter((baseUrl): baseUrl is string => Boolean(baseUrl)))];
  const results = await Promise.allSettled(targets.map((baseUrl) => postSignedRevalidationRequest(baseUrl, bodyText, secret)));

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn('[admin] storefront asset revalidation request failed', {
        baseUrl: targets[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}

export async function revalidateStorefrontProducts() {
  const baseUrl = getStorefrontNewBaseUrl();
  if (!baseUrl) {
    return;
  }

  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn('[admin] storefront product revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured');
    return;
  }

  try {
    await postSignedRevalidationRequest(baseUrl, JSON.stringify({ scope: 'products' }), secret);
  } catch (error) {
    console.warn('[admin] storefront product revalidation request failed', {
      baseUrl,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function revalidateStorefrontProductMeta() {
  const baseUrl = getStorefrontNewBaseUrl();
  if (!baseUrl) return;

  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn('[admin] storefront product metadata revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured');
    return;
  }

  try {
    await postSignedRevalidationRequest(baseUrl, JSON.stringify({ scope: 'product-meta' }), secret);
  } catch (error) {
    console.warn('[admin] storefront product metadata revalidation request failed', {
      baseUrl,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function revalidateStorefrontSettings() {
  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn('[admin] storefront settings revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured');
    return;
  }

  const targets = [getStorefrontApiBaseUrl(), getStorefrontNewBaseUrl()].filter(
    (baseUrl): baseUrl is string => Boolean(baseUrl),
  );
  const bodyText = JSON.stringify({ scope: 'settings' });
  const results = await Promise.allSettled(
    targets.map((baseUrl) => postSignedRevalidationRequest(baseUrl, bodyText, secret)),
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn('[admin] storefront settings revalidation request failed', {
        baseUrl: targets[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}

export async function revalidateStorefrontLandingPages() {
  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn('[admin] storefront landing-page revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured');
    return;
  }
  const targets = [getStorefrontApiBaseUrl(), getStorefrontNewBaseUrl()].filter((baseUrl): baseUrl is string => Boolean(baseUrl));
  const bodyText = JSON.stringify({ scope: 'landing-pages' });
  const results = await Promise.allSettled(targets.map((baseUrl) => postSignedRevalidationRequest(baseUrl, bodyText, secret)));
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.warn('[admin] storefront landing-page revalidation request failed', { baseUrl: targets[index], error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
  });
}
