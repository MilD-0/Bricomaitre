import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enforceOrderVelocityLimit } from './request-security';

const { applyRateLimitMock, getRedisMock } = vi.hoisted(() => ({
  applyRateLimitMock: vi.fn(),
  getRedisMock: vi.fn(),
}));

vi.mock('@bric/runtime/rate-limit', () => ({
  applyRateLimit: applyRateLimitMock,
}));

vi.mock('@bric/runtime/redis', () => ({
  getRedis: getRedisMock,
}));

describe('request-security order velocity limit', () => {
  const redis = {
    ttl: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(() => {
    vi.useRealTimers();
    applyRateLimitMock.mockReset();
    getRedisMock.mockReset();
    redis.ttl.mockReset();
    redis.incr.mockReset();
    redis.expire.mockReset();
    redis.set.mockReset();
    getRedisMock.mockReturnValue(redis);
  });

  it('allows six order attempts per fifteen minutes for the selected identity', async () => {
    redis.ttl.mockResolvedValue(-2);
    applyRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 6,
      remaining: 5,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });

    const result = await enforceOrderVelocityLimit(
      new NextRequest('https://api.example.test/storefront/orders', {
        headers: { 'x-forwarded-for': '198.51.100.77' },
      }),
      { journeyId: 'journey-1', visitId: 'visit-1', sessionId: 'session-1' },
    );

    expect(result.ok).toBe(true);
    expect(applyRateLimitMock).toHaveBeenCalledWith({
      scope: 'storefront-order-velocity',
      key: 'journey:journey-1',
      limit: 6,
      windowSeconds: 900,
    });
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('locks an identity for ten minutes on the first velocity breach', async () => {
    redis.ttl.mockResolvedValue(-2);
    redis.incr.mockResolvedValue(1);
    applyRateLimitMock.mockResolvedValue({
      ok: false,
      limit: 6,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });

    const result = await enforceOrderVelocityLimit(
      new NextRequest('https://api.example.test/storefront/orders'),
      { journeyId: 'journey-1' },
    );

    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBe(600);
    expect(redis.expire).toHaveBeenCalledWith(
      'bric:ratelimit:storefront-order-velocity:violations:journey:journey-1',
      7200,
    );
    expect(redis.set).toHaveBeenCalledWith(
      'bric:ratelimit:storefront-order-velocity:penalty:journey:journey-1',
      '1',
      'EX',
      600,
    );
  });

  it('escalates a repeat velocity breach to one hour', async () => {
    redis.ttl.mockResolvedValue(-2);
    redis.incr.mockResolvedValue(2);
    applyRateLimitMock.mockResolvedValue({
      ok: false,
      limit: 6,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });

    const result = await enforceOrderVelocityLimit(
      new NextRequest('https://api.example.test/storefront/orders'),
      { visitId: 'visit-1' },
    );

    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBe(3600);
    expect(redis.expire).not.toHaveBeenCalled();
    expect(redis.set).toHaveBeenCalledWith(
      'bric:ratelimit:storefront-order-velocity:penalty:visit:visit-1',
      '2',
      'EX',
      3600,
    );
  });

  it('keeps an active penalty without escalating it on every retry', async () => {
    redis.ttl.mockResolvedValue(3599);

    const result = await enforceOrderVelocityLimit(
      new NextRequest('https://api.example.test/storefront/orders', {
        headers: { 'x-real-ip': '198.51.100.77' },
      }),
      {},
    );

    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBe(3599);
    expect(applyRateLimitMock).not.toHaveBeenCalled();
    expect(redis.incr).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});
