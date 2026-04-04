import type { NextRequest } from 'next/server';

import { applyRateLimit, type RateLimitResult } from '@bric/runtime/rate-limit';

export function getRequestClientKey(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = request.headers.get('x-real-ip')?.trim();
  return forwardedFor || realIp || 'unknown';
}

export async function enforceRequestRateLimit(
  request: NextRequest,
  options: {
    scope: string;
    limit: number;
    windowSeconds: number;
    suffix?: string;
  },
) {
  const clientKey = getRequestClientKey(request);
  return applyRateLimit({
    scope: options.scope,
    key: options.suffix ? `${clientKey}:${options.suffix}` : clientKey,
    limit: options.limit,
    windowSeconds: options.windowSeconds,
  });
}

export function buildRateLimitHeaders(result: RateLimitResult) {
  return {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
    'retry-after': String(result.retryAfterSeconds),
  };
}
