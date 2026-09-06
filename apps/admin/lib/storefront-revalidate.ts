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

async function invalidateInOrder(targets: string[], bodyText: string, secret: string) {
  const results: PromiseSettledResult<void>[] = [];
  // Expire canonical data before any consumer can refill its own cache.
  for (const target of targets) {
    try {
      await postSignedRevalidationRequest(target, bodyText, secret);
      results.push({ status: 'fulfilled', value: undefined });
    } catch (reason) {
      results.push({ status: 'rejected', reason });
    }
  }
  return results;
}

export async function revalidateStorefrontAssets() {
  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn(
      '[admin] storefront asset revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured',
    );
    return;
  }

  const bodyText = JSON.stringify({ scope: 'assets' });
  const targets = [
    ...new Set(
      [getStorefrontApiBaseUrl(), getStorefrontBaseUrl()].filter((baseUrl): baseUrl is string =>
        Boolean(baseUrl),
      ),
    ),
  ];
  const results = await invalidateInOrder(targets, bodyText, secret);

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
  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn(
      '[admin] storefront product revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured',
    );
    return;
  }

  await revalidateTargets(
    [getStorefrontApiBaseUrl(), getStorefrontBaseUrl()],
    { scope: 'products' },
    secret,
    'product',
  );
}

export async function revalidateStorefrontProductMeta() {
  revalidateServerTags(CACHE_TAGS.productsMeta);
  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn(
      '[admin] storefront product metadata revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured',
    );
    return;
  }

  await revalidateTargets(
    [getStorefrontApiBaseUrl(), getStorefrontBaseUrl()],
    { scope: 'product-meta' },
    secret,
    'product metadata',
  );
}

async function revalidateTargets(
  candidateTargets: Array<string | null>,
  payload: { scope: string },
  secret: string,
  label: string,
) {
  const targets = [
    ...new Set(candidateTargets.filter((baseUrl): baseUrl is string => Boolean(baseUrl))),
  ];
  const bodyText = JSON.stringify(payload);
  const results = await invalidateInOrder(targets, bodyText, secret);

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.warn(`[admin] storefront ${label} revalidation request failed`, {
        baseUrl: targets[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });
}

export async function revalidateStorefrontSettings() {
  const secret = getStorefrontRevalidateSecret();
  if (!secret) {
    console.warn(
      '[admin] storefront settings revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured',
    );
    return;
  }

  const targets = [getStorefrontApiBaseUrl(), getStorefrontBaseUrl()].filter(
    (baseUrl): baseUrl is string => Boolean(baseUrl),
  );
  const bodyText = JSON.stringify({ scope: 'settings' });
  const results = await invalidateInOrder(targets, bodyText, secret);

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
    console.warn(
      '[admin] storefront landing-page revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured',
    );
    return;
  }
  const targets = [getStorefrontApiBaseUrl(), getStorefrontBaseUrl()].filter(
    (baseUrl): baseUrl is string => Boolean(baseUrl),
  );
  const bodyText = JSON.stringify({ scope: 'landing-pages' });
  const results = await invalidateInOrder(targets, bodyText, secret);
  results.forEach((result, index) => {
    if (result.status === 'rejected')
      console.warn('[admin] storefront landing-page revalidation request failed', {
        baseUrl: targets[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
  });
}
