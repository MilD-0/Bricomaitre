import { CACHE_TAGS, revalidateServerTags } from './server-cache';
import { getStorefrontPublicBaseUrl } from './storefront-public-url';
import { signInternalRequest } from '@bric/runtime/internal-signing';
import { buildLandingPagePreviewPayload } from '@bric/storefront-core/landing-pages';

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

function getStorefrontRevalidateSecret() {
  return process.env.STOREFRONT_REVALIDATE_SECRET?.trim() ?? '';
}

export function buildStorefrontLandingPagePreviewUrl(
  input: { locale: string; slug: string; revision: number },
  options: { nowMs?: number } = {},
) {
  const secret = getStorefrontRevalidateSecret();
  if (!secret) throw new Error('Landing-page preview signing is not configured.');

  const timestamp = String(options.nowMs ?? Date.now());
  const payload = buildLandingPagePreviewPayload(input);
  const signature = signInternalRequest(payload, secret, timestamp);
  const url = new URL(
    `${getStorefrontPublicBaseUrl()}/${input.locale}/landing-preview/${encodeURIComponent(input.slug)}`,
  );
  url.searchParams.set('previewRevision', String(input.revision));
  url.searchParams.set('previewTimestamp', timestamp);
  url.searchParams.set('previewSignature', signature);
  return url.toString();
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

async function revalidateScope(scope: string, label: string) {
  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn(
      `[admin] storefront ${label} revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured`,
    );
    return;
  }
  const bodyText = JSON.stringify({ scope });
  // Expire canonical data before any consumer can refill its own cache.
  for (const baseUrl of new Set([getStorefrontApiBaseUrl(), getStorefrontBaseUrl()])) {
    if (!baseUrl) continue;
    try {
      await postSignedRevalidationRequest(baseUrl, bodyText, secret);
    } catch (error) {
      console.warn(`[admin] storefront ${label} revalidation request failed`, {
        baseUrl,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export function revalidateStorefrontAssets() {
  return revalidateScope('assets', 'asset');
}

export function revalidateStorefrontProducts() {
  return revalidateScope('products', 'product');
}

export async function revalidateStorefrontProductMeta() {
  revalidateServerTags(CACHE_TAGS.productsMeta);
  await revalidateScope('product-meta', 'product metadata');
}

export function revalidateStorefrontSettings() {
  return revalidateScope('settings', 'settings');
}

export function revalidateStorefrontLandingPages() {
  return revalidateScope('landing-pages', 'landing-page');
}
