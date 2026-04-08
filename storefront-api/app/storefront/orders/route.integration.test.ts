import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';

const { hasDbMock, getDbMock, createStorefrontOrderMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  createStorefrontOrderMock: vi.fn(),
}));
const {
  beginIdempotentRequestMock,
  buildIdempotencyFingerprintMock,
  clearIdempotentRequestMock,
  completeIdempotentRequestMock,
} = vi.hoisted(() => ({
  beginIdempotentRequestMock: vi.fn(),
  buildIdempotencyFingerprintMock: vi.fn(),
  clearIdempotentRequestMock: vi.fn(),
  completeIdempotentRequestMock: vi.fn(),
}));
const { buildRateLimitHeadersMock, enforceRequestRateLimitMock } = vi.hoisted(() => ({
  buildRateLimitHeadersMock: vi.fn(),
  enforceRequestRateLimitMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/orders', () => ({
  createStorefrontOrder: createStorefrontOrderMock,
}));

vi.mock('@bric/runtime/idempotency', () => ({
  beginIdempotentRequest: beginIdempotentRequestMock,
  buildIdempotencyFingerprint: buildIdempotencyFingerprintMock,
  clearIdempotentRequest: clearIdempotentRequestMock,
  completeIdempotentRequest: completeIdempotentRequestMock,
}));

vi.mock('../../../lib/request-security', () => ({
  buildRateLimitHeaders: buildRateLimitHeadersMock,
  enforceRequestRateLimit: enforceRequestRateLimitMock,
}));

describe('app/storefront/orders/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    createStorefrontOrderMock.mockReset();
    beginIdempotentRequestMock.mockReset();
    buildIdempotencyFingerprintMock.mockReset();
    clearIdempotentRequestMock.mockReset();
    completeIdempotentRequestMock.mockReset();
    buildRateLimitHeadersMock.mockReset();
    enforceRequestRateLimitMock.mockReset();
    createStorefrontOrderMock.mockResolvedValue({ id: 11, publicToken: 'public-token' });
    beginIdempotentRequestMock.mockResolvedValue({ kind: 'started' });
    buildIdempotencyFingerprintMock.mockReturnValue('fingerprint');
    clearIdempotentRequestMock.mockResolvedValue(undefined);
    completeIdempotentRequestMock.mockResolvedValue(undefined);
    buildRateLimitHeadersMock.mockReturnValue({});
    enforceRequestRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 20,
      remaining: 19,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  it('returns 503 when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await POST(new NextRequest('http://localhost/storefront/orders', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns validation errors for invalid payloads', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(storefrontOrderCreateRequestSchema, 'safeParse').mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { cartProducts: ['Required'] } }) },
    } as never);

    const res = await POST(new NextRequest('http://localhost/storefront/orders', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: { fieldErrors: { cartProducts: ['Required'] } } });
  });

  it('accepts phone-only payloads in the create request schema', () => {
    const parsed = storefrontOrderCreateRequestSchema.safeParse({
      phoneNumber1: '0550111111',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.cartProducts : []).toEqual([]);
    expect(parsed.success ? parsed.data.state : undefined).toBeNull();
  });

  it('creates a storefront order and returns the public token-backed record', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    vi.spyOn(storefrontOrderCreateRequestSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phoneNumber1: '0550111111',
        phoneNumber2: null,
        cartProducts: ['9'],
        delivery: 0,
        state: 31,
        city: 'Oran',
        homeAddress: 'Street 1',
        note: 'Call first',
      },
    } as never);

    const res = await POST(new NextRequest('http://localhost/storefront/orders', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }));

    expect(createStorefrontOrderMock).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({
        phoneNumber1: '0550111111',
        delivery: 0,
      }),
      expect.objectContaining({
        reportTiming: expect.any(Function),
      }),
    );
    await expect(res.json()).resolves.toEqual({ ok: true, item: { id: 11, publicToken: 'public-token' } });
  });

  it('logs slow order creation timings without changing the response', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const performanceNowSpy = vi.spyOn(performance, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(2305);
    vi.spyOn(storefrontOrderCreateRequestSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phoneNumber1: '0550111111',
        phoneNumber2: null,
        cartProducts: ['9'],
        delivery: 0,
        state: 31,
        city: 'Oran',
        homeAddress: 'Street 1',
        note: 'Call first',
        journeyId: 'journey-1',
        sessionId: 'session-1',
      },
    } as never);
    createStorefrontOrderMock.mockImplementation(async (_db, _payload, options) => {
      options?.reportTiming?.({ step: 'insertOrder', durationMs: 2100 });
      return { id: 11, publicToken: 'public-token' };
    });

    const res = await POST(new NextRequest('http://localhost/storefront/orders', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }));

    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(
      '[storefront-api] order create timing',
      expect.objectContaining({
        outcome: 'slow',
        totalDurationMs: 2205,
        timings: [{ step: 'insertOrder', durationMs: 2100 }],
        payload: expect.objectContaining({
          cartSize: 1,
          hasJourneyId: true,
          hasSessionId: true,
        }),
      }),
    );
    performanceNowSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('returns the stored response for a completed idempotent request', async () => {
    hasDbMock.mockReturnValue(true);
    beginIdempotentRequestMock.mockResolvedValue({
      kind: 'existing',
      record: {
        status: 'completed',
        fingerprint: 'fingerprint',
        response: {
          statusCode: 200,
          body: { ok: true, item: { id: 11, publicToken: 'public-token' } },
        },
      },
    });

    const res = await POST(new NextRequest('http://localhost/storefront/orders', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber1: '0550111111' }),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'submission-key',
      },
    }));

    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ ok: true, item: { id: 11, publicToken: 'public-token' } });
  });

  it('returns 409 when an idempotency key is reused with a different payload fingerprint', async () => {
    hasDbMock.mockReturnValue(true);
    beginIdempotentRequestMock.mockResolvedValue({
      kind: 'existing',
      record: {
        status: 'completed',
        fingerprint: 'different-fingerprint',
        response: {
          statusCode: 200,
          body: { ok: true, item: { id: 11, publicToken: 'public-token' } },
        },
      },
    });

    const res = await POST(new NextRequest('http://localhost/storefront/orders', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber1: '0550111111' }),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'submission-key',
      },
    }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Idempotency key already used with a different payload.',
    });
  });
});
