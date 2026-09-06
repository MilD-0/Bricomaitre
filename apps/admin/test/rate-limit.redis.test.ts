import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { applyRateLimit } from '@bric/runtime/rate-limit';
import { closeRedisConnections, getRedis } from '@bric/runtime/redis';

const scope = `rate-limit-${crypto.randomUUID()}`;
const keys: string[] = [];
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (keys.length) await getRedis().unlink(...keys);
  await closeRedisConnections();
});

it('counts concurrent requests exactly, expires each window and isolates customers', async () => {
  const now = Date.now();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  const options = { scope, key: 'customer-a', limit: 4, windowSeconds: 60 };
  const bucket = Math.floor(now / 60_000);
  const counter = `bric:ratelimit:${scope}:customer-a:${bucket}`;
  keys.push(counter, `bric:ratelimit:${scope}:customer-b:${bucket}`);
  const responses = await Promise.all(Array.from({ length: 20 }, () => applyRateLimit(options)));
  expect(responses.filter((response) => response.ok)).toHaveLength(4);
  expect(await getRedis().get(counter)).toBe('20');
  expect(await getRedis().ttl(counter)).toBeGreaterThan(0);
  await expect(applyRateLimit({ ...options, key: 'customer-b' })).resolves.toMatchObject({
    ok: true,
    remaining: 3,
  });

  await getRedis().expire(counter, 30);
  await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: false, remaining: 0 });
  expect(await getRedis().ttl(counter)).toBeLessThanOrEqual(30);
  expect(responses.every((response) => response.resetAt === (bucket + 1) * 60_000)).toBe(true);
});
