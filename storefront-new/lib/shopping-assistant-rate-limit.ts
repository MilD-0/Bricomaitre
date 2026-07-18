import { applyRateLimit, type RateLimitResult } from '@bric/runtime/rate-limit';
import type { NextRequest } from 'next/server';

export function getShoppingAssistantClientKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')?.trim()
    || 'unknown';
}

export function shoppingAssistantRateLimitHeaders(result: RateLimitResult) {
  return {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1_000)),
    'retry-after': String(result.retryAfterSeconds),
  };
}

export function enforceShoppingAssistantRateLimit(request: NextRequest) {
  return applyRateLimit({
    scope: 'storefront-new-shopping-assistant',
    key: getShoppingAssistantClientKey(request),
    limit: 12,
    windowSeconds: 60,
  });
}
