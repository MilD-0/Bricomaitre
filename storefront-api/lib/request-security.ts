import type { NextRequest } from 'next/server';

import { applyRateLimit, type RateLimitResult } from '@bric/runtime/rate-limit';
import { getRedis } from '@bric/runtime/redis';

const ORDER_VELOCITY_LIMIT = 6;
const ORDER_VELOCITY_WINDOW_SECONDS = 15 * 60;
const ORDER_VELOCITY_FIRST_PENALTY_SECONDS = 10 * 60;
const ORDER_VELOCITY_REPEAT_PENALTY_SECONDS = 60 * 60;
const ORDER_VELOCITY_VIOLATION_TTL_SECONDS = 2 * 60 * 60;

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

export async function enforceGlobalRateLimit(options: {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
}) {
  return applyRateLimit(options);
}

function getOrderVelocityIdentity(input: {
  clientKey: string;
  journeyId?: string | null;
  visitId?: string | null;
  sessionId?: string | null;
}) {
  if (input.journeyId) return `journey:${input.journeyId}`;
  if (input.visitId) return `visit:${input.visitId}`;
  if (input.sessionId) return `session:${input.sessionId}`;
  return `ip:${input.clientKey}`;
}

export async function enforceOrderVelocityLimit(
  request: NextRequest,
  identity: {
    journeyId?: string | null;
    visitId?: string | null;
    sessionId?: string | null;
  },
) {
  const redis = getRedis();
  const clientKey = getRequestClientKey(request);
  const key = getOrderVelocityIdentity({ clientKey, ...identity });
  const penaltyKey = `bric:ratelimit:storefront-order-velocity:penalty:${key}`;
  const violationKey = `bric:ratelimit:storefront-order-velocity:violations:${key}`;
  const activePenaltySeconds = await redis.ttl(penaltyKey);

  if (activePenaltySeconds > 0) {
    return {
      ok: false,
      limit: ORDER_VELOCITY_LIMIT,
      remaining: 0,
      resetAt: Date.now() + activePenaltySeconds * 1000,
      retryAfterSeconds: activePenaltySeconds,
    } satisfies RateLimitResult;
  }

  const rateLimit = await applyRateLimit({
    scope: 'storefront-order-velocity',
    key,
    limit: ORDER_VELOCITY_LIMIT,
    windowSeconds: ORDER_VELOCITY_WINDOW_SECONDS,
  });

  if (rateLimit.ok) {
    return rateLimit;
  }

  const violations = await redis.incr(violationKey);
  if (violations === 1) {
    await redis.expire(violationKey, ORDER_VELOCITY_VIOLATION_TTL_SECONDS);
  }

  const penaltySeconds = violations >= 2
    ? ORDER_VELOCITY_REPEAT_PENALTY_SECONDS
    : ORDER_VELOCITY_FIRST_PENALTY_SECONDS;
  await redis.set(penaltyKey, String(violations), 'EX', penaltySeconds);

  return {
    ok: false,
    limit: ORDER_VELOCITY_LIMIT,
    remaining: 0,
    resetAt: Date.now() + penaltySeconds * 1000,
    retryAfterSeconds: penaltySeconds,
  } satisfies RateLimitResult;
}

export function buildRateLimitHeaders(result: RateLimitResult) {
  return {
    'x-ratelimit-limit': String(result.limit),
    'x-ratelimit-remaining': String(result.remaining),
    'x-ratelimit-reset': String(Math.ceil(result.resetAt / 1000)),
    'retry-after': String(result.retryAfterSeconds),
  };
}
