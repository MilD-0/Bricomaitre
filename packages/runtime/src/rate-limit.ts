import { getRedis } from './redis';

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

export async function applyRateLimit(options: {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
}) {
  const redis = getRedis();
  const now = Date.now();
  const bucket = Math.floor(now / (options.windowSeconds * 1000));
  const redisKey = `bric:ratelimit:${options.scope}:${options.key}:${bucket}`;
  const total = await redis.incr(redisKey);

  if (total === 1) {
    await redis.expire(redisKey, options.windowSeconds);
  }

  const resetAt = (bucket + 1) * options.windowSeconds * 1000;
  return {
    ok: total <= options.limit,
    limit: options.limit,
    remaining: Math.max(options.limit - total, 0),
    resetAt,
    retryAfterSeconds: Math.max(Math.ceil((resetAt - now) / 1000), 0),
  } satisfies RateLimitResult;
}
