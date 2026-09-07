import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildRateLimitHeaders,
  enforceGlobalRateLimit,
  enforceOrderVelocityLimit,
  enforceRequestRateLimit,
  getRequestClientKey,
} from './request-security';

describe('request-security client identity', () => {
  it('prefers the address supplied by the trusted reverse proxy', () => {
    const request = new NextRequest('https://api.example.test/storefront/products', {
      headers: {
        'x-forwarded-for': '198.51.100.23, 10.0.0.8',
        'x-real-ip': '203.0.113.42',
      },
    });

    expect(getRequestClientKey(request)).toBe('203.0.113.42');
  });

  it('uses the last forwarded address when no real-ip header is available', () => {
    const request = new NextRequest('https://api.example.test/storefront/products', {
      headers: { 'x-forwarded-for': '198.51.100.23, 203.0.113.42' },
    });

    expect(getRequestClientKey(request)).toBe('203.0.113.42');
  });
});

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

describe('request and subject rate limits', () => {
  const allowed = { ok: true, limit: 60, remaining: 59, resetAt: 100_001, retryAfterSeconds: 60 };
  const blocked = { ...allowed, ok: false, remaining: 0 };
  const request = new NextRequest('https://api.example.test/storefront/orders/track', {
    headers: { 'x-real-ip': '203.0.113.42' },
  });

  beforeEach(() => applyRateLimitMock.mockReset());

  it('hashes private lookup subjects and enforces their limit after the client limit', async () => {
    applyRateLimitMock.mockResolvedValueOnce(allowed).mockResolvedValueOnce(blocked);
    expect(
      await enforceRequestRateLimit(request, {
        scope: 'track',
        limit: 60,
        windowSeconds: 60,
        suffix: 'private-order-token',
      }),
    ).toEqual(blocked);
    expect(applyRateLimitMock).toHaveBeenNthCalledWith(1, {
      scope: 'track',
      key: '203.0.113.42',
      limit: 60,
      windowSeconds: 60,
    });
    expect(applyRateLimitMock).toHaveBeenNthCalledWith(2, {
      scope: 'track:subject',
      key: expect.stringMatching(/^[a-f0-9]{64}$/),
      limit: 60,
      windowSeconds: 60,
    });
    expect(JSON.stringify(applyRateLimitMock.mock.calls)).not.toContain('private-order-token');
    expect(buildRateLimitHeaders(blocked)).toEqual({
      'x-ratelimit-limit': '60',
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': '101',
      'retry-after': '60',
    });
  });

  it('does not consume a subject allowance after the client is blocked', async () => {
    applyRateLimitMock.mockResolvedValue(blocked);
    expect(
      await enforceRequestRateLimit(request, {
        scope: 'track',
        limit: 60,
        windowSeconds: 60,
        suffix: 'private-order-token',
      }),
    ).toEqual(blocked);
    expect(applyRateLimitMock).toHaveBeenCalledOnce();
  });

  it('uses a shared global quota independent of the caller address', async () => {
    applyRateLimitMock.mockResolvedValue(blocked);
    expect(
      await enforceGlobalRateLimit({ scope: 'analytics', limit: 60, windowSeconds: 60 }),
    ).toEqual(blocked);
    expect(applyRateLimitMock).toHaveBeenCalledWith({
      scope: 'analytics',
      key: 'global',
      limit: 60,
      windowSeconds: 60,
    });
  });
});

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

  it('limits both the client address and selected analytics identity', async () => {
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
    expect(applyRateLimitMock).toHaveBeenNthCalledWith(1, {
      scope: 'storefront-order-velocity',
      key: 'ip:198.51.100.77',
      limit: 6,
      windowSeconds: 900,
    });
    expect(applyRateLimitMock).toHaveBeenNthCalledWith(2, {
      scope: 'storefront-order-velocity',
      key: 'journey:journey-1',
      limit: 6,
      windowSeconds: 900,
    });
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it('locks the client address for ten minutes even when identities can rotate', async () => {
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
      'bric:ratelimit:storefront-order-velocity:violations:ip:unknown',
      7200,
    );
    expect(redis.set).toHaveBeenCalledWith(
      'bric:ratelimit:storefront-order-velocity:penalty:ip:unknown',
      '1',
      'EX',
      600,
    );
  });

  it('escalates a repeat velocity breach to one hour', async () => {
    redis.ttl.mockResolvedValue(-2);
    redis.incr.mockResolvedValue(2);
    applyRateLimitMock
      .mockResolvedValueOnce({
        ok: true,
        limit: 6,
        remaining: 5,
        resetAt: Date.now() + 60_000,
        retryAfterSeconds: 60,
      })
      .mockResolvedValueOnce({
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
