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
  const targets = [getStorefrontApiBaseUrl(), getStorefrontBaseUrl()];
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
