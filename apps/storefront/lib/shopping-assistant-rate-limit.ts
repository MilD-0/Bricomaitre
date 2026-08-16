import { applyRateLimit, type RateLimitResult } from '@bric/runtime/rate-limit';
import { getTrustedClientIp } from '@bric/runtime/client-ip';
import type { NextRequest } from 'next/server';

export function getShoppingAssistantClientKey(request: NextRequest) {
  return getTrustedClientIp(request.headers) || 'unknown';
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
    scope: 'storefront-shopping-assistant',
    key: getShoppingAssistantClientKey(request),
    limit: 12,
    windowSeconds: 60,
  });
}
