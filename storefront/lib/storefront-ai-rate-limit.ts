import { applyRateLimit, type RateLimitResult } from '@bric/runtime/rate-limit';
import type { NextRequest } from 'next/server';

export function getStorefrontAiClientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

export function storefrontAiRateLimitHeaders(result: RateLimitResult) {
  return {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1_000)),
    'retry-after': String(result.retryAfterSeconds),
  };
}

export async function enforceStorefrontAiRateLimit(request: NextRequest) {
  return applyRateLimit({
    scope: 'storefront-shopping-ai',
    key: getStorefrontAiClientKey(request),
    limit: 12,
    windowSeconds: 60,
  });
}
