import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';

const { hasDbMock, getDbMock, createStorefrontOrderMock, readCommittedStorefrontOrderMock } =
  vi.hoisted(() => ({
    hasDbMock: vi.fn(),
    getDbMock: vi.fn(),
    createStorefrontOrderMock: vi.fn(),
    readCommittedStorefrontOrderMock: vi.fn(),
  }));
const {
  beginIdempotentRequestMock,
  buildIdempotencyFingerprintMock,
  buildIdempotencyKeyHashMock,
  clearIdempotentRequestMock,
  completeIdempotentRequestMock,
} = vi.hoisted(() => ({
  beginIdempotentRequestMock: vi.fn(),
  buildIdempotencyFingerprintMock: vi.fn(),
  buildIdempotencyKeyHashMock: vi.fn(),
  clearIdempotentRequestMock: vi.fn(),
  completeIdempotentRequestMock: vi.fn(),
}));
const { buildRateLimitHeadersMock, enforceOrderVelocityLimitMock, enforceRequestRateLimitMock } =
  vi.hoisted(() => ({
    buildRateLimitHeadersMock: vi.fn(),
    enforceOrderVelocityLimitMock: vi.fn(),
    enforceRequestRateLimitMock: vi.fn(),
  }));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/orders', () => ({
  createStorefrontOrder: createStorefrontOrderMock,
  readCommittedStorefrontOrder: readCommittedStorefrontOrderMock,
}));

const { claimStorefrontOrderIdempotencyMock, clearStorefrontOrderIdempotencyMock } = vi.hoisted(
  () => ({
    claimStorefrontOrderIdempotencyMock: vi.fn(),
    clearStorefrontOrderIdempotencyMock: vi.fn(),
  }),
);

vi.mock('@bric/storefront-core/order-idempotency', () => ({
  claimStorefrontOrderIdempotency: claimStorefrontOrderIdempotencyMock,
  clearStorefrontOrderIdempotency: clearStorefrontOrderIdempotencyMock,
}));

vi.mock('@bric/runtime/idempotency', () => ({
  beginIdempotentRequest: beginIdempotentRequestMock,
  buildIdempotencyFingerprint: buildIdempotencyFingerprintMock,
  buildIdempotencyKeyHash: buildIdempotencyKeyHashMock,
  clearIdempotentRequest: clearIdempotentRequestMock,
  completeIdempotentRequest: completeIdempotentRequestMock,
}));

vi.mock('../../../lib/request-security', () => ({
  buildRateLimitHeaders: buildRateLimitHeadersMock,
  enforceOrderVelocityLimit: enforceOrderVelocityLimitMock,
  enforceRequestRateLimit: enforceRequestRateLimitMock,
}));

describe('app/storefront/orders/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    createStorefrontOrderMock.mockReset();
    readCommittedStorefrontOrderMock.mockReset();
    claimStorefrontOrderIdempotencyMock.mockReset();
    clearStorefrontOrderIdempotencyMock.mockReset();
    beginIdempotentRequestMock.mockReset();
    buildIdempotencyFingerprintMock.mockReset();
    clearIdempotentRequestMock.mockReset();
    completeIdempotentRequestMock.mockReset();
    buildRateLimitHeadersMock.mockReset();
    enforceOrderVelocityLimitMock.mockReset();
    enforceRequestRateLimitMock.mockReset();
    createStorefrontOrderMock.mockResolvedValue({ id: 11, publicToken: 'public-token' });
    beginIdempotentRequestMock.mockResolvedValue({ kind: 'started' });
    buildIdempotencyFingerprintMock.mockReturnValue('fingerprint');
    buildIdempotencyKeyHashMock.mockReturnValue('key-hash');
    claimStorefrontOrderIdempotencyMock.mockResolvedValue({ kind: 'started' });
    clearStorefrontOrderIdempotencyMock.mockResolvedValue(undefined);
    readCommittedStorefrontOrderMock.mockResolvedValue({ id: 11, publicToken: 'public-token' });
    clearIdempotentRequestMock.mockResolvedValue(undefined);
    completeIdempotentRequestMock.mockResolvedValue(undefined);
    buildRateLimitHeadersMock.mockReturnValue({});
    enforceRequestRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 20,
      remaining: 19,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    });
    enforceOrderVelocityLimitMock.mockResolvedValue({
      ok: true,
      limit: 2,
      remaining: 1,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  it('returns 503 when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns a controlled 503 when request rate limiting is unavailable', async () => {
    hasDbMock.mockReturnValue(true);
    enforceRequestRateLimitMock.mockRejectedValue(new Error('Redis unavailable'));

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'submission-key' },
      }),
    );

    expect(res.status).toBe(503);
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Order service is temporarily unavailable. Please try again.',
    });
  });

  it('returns 400 for invalid JSON bodies', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: '{',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'submission-key' },
      }),
    );

    expect(res.status).toBe(400);
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON request body.' });
  });

  it('returns validation errors for invalid payloads', async () => {
    hasDbMock.mockReturnValue(true);
    vi.spyOn(storefrontOrderCreateRequestSchema, 'safeParse').mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { cartProducts: ['Required'] } }) },
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'submission-key' },
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid order request.',
      details: { fieldErrors: { cartProducts: ['Required'] } },
    });
  });

  it('accepts phone-only payloads in the create request schema', () => {
    const parsed = storefrontOrderCreateRequestSchema.safeParse({
      phoneNumber1: '0550111111',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.cartProducts : []).toEqual([]);
    expect(parsed.success ? parsed.data.state : undefined).toBeNull();
  });

  it('treats malformed optional emails as absent in the create request schema', () => {
    const parsed = storefrontOrderCreateRequestSchema.safeParse({
      phoneNumber1: '0550111111',
      email: 'not an email',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.email : undefined).toBeNull();
  });

  it('normalizes valid optional emails in the create request schema', () => {
    const parsed = storefrontOrderCreateRequestSchema.safeParse({
      phoneNumber1: '0550111111',
      email: '  ADA@EXAMPLE.COM  ',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success ? parsed.data.email : undefined).toBe('ada@example.com');
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
        promoCode: 'Spring-50',
      },
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'submission-key' },
      }),
    );

    expect(enforceOrderVelocityLimitMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        journeyId: undefined,
        visitId: undefined,
        sessionId: undefined,
      }),
    );
    expect(beginIdempotentRequestMock).toHaveBeenCalled();
    expect(createStorefrontOrderMock).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({
        phoneNumber1: '0550111111',
        delivery: 0,
        promoCode: 'Spring-50',
      }),
      expect.objectContaining({
        reportTiming: expect.any(Function),
      }),
    );
    await expect(res.json()).resolves.toEqual({
      ok: true,
      item: { id: 11, publicToken: 'public-token' },
    });
    expect(res.status).toBe(201);
  });

  it('rejects order creation without an idempotency key', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'idempotency_key_required' });
    expect(enforceRequestRateLimitMock).not.toHaveBeenCalled();
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
  });

  it('passes trusted Meta context into the transactional order create flow', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    process.env.STOREFRONT_META_PROXY_SECRET = 'proxy-secret';
    createStorefrontOrderMock.mockResolvedValue({
      item: { id: 12, publicToken: 'public-token-12' },
      meta: {
        eventName: 'Purchase',
        eventId: 'purchase-12',
        value: 2400,
        currency: 'DZD',
        contents: [{ id: '9', quantity: 2, item_price: 1200 }],
      },
    });

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber1: '0550111111',
          cartProducts: ['9', '9'],
          meta: {
            semanticsVersion: 'confirmed_purchase_v1',
            leadEventId: 'purchase-12',
            eventSourceUrl: 'https://bricomaitre.com/checkout',
          },
          marketing: {
            semanticsVersion: 'multi_destination_v1',
            eventId: 'purchase-12',
            eventSourceUrl: 'https://bricomaitre.com/checkout',
            google: { clientId: '123.456' },
            tiktok: { clickId: 'tt-click' },
          },
        }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
          'x-storefront-meta-proxy-secret': 'proxy-secret',
          'x-real-ip': '203.0.113.12',
          'user-agent': 'Vitest',
          cookie: '_fbc=fb.1.1700000000.click; _fbp=fb.1.1700000000.1',
        },
      }),
    );

    expect(res.status).toBe(201);
    expect(createStorefrontOrderMock).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({
        meta: expect.objectContaining({ leadEventId: 'purchase-12' }),
        marketing: expect.objectContaining({ eventId: 'purchase-12' }),
      }),
      expect.objectContaining({
        metaRequestContext: expect.objectContaining({
          clientIpAddress: '203.0.113.12',
          clientUserAgent: 'Vitest',
        }),
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      item: { id: 12 },
      meta: { eventName: 'Purchase', eventId: 'purchase-12', value: 2400 },
    });
  });

  it('starts idempotent keyed requests with a short processing TTL', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(res.status).toBe(201);
    expect(beginIdempotentRequestMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'storefront-order-create',
        key: 'submission-key',
        ttlSeconds: 120,
      }),
    );
  });

  it('returns a controlled 503 when idempotency storage is unavailable', async () => {
    hasDbMock.mockReturnValue(true);
    beginIdempotentRequestMock.mockRejectedValue(new Error('Redis unavailable'));

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(res.status).toBe(503);
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
  });

  it('replays a committed order from durable storage when Redis lost its completed response', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    claimStorefrontOrderIdempotencyMock.mockResolvedValue({
      kind: 'completed',
      orderId: 11,
      metaResponse: { eventId: 'purchase-11' },
    });

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(res.status).toBe(201);
    expect(readCommittedStorefrontOrderMock).toHaveBeenCalledWith({ tag: 'db' }, 11);
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      ok: true,
      item: { id: 11, publicToken: 'public-token' },
      meta: { eventId: 'purchase-11' },
    });
  });

  it('returns a controlled 503 and releases its claim when velocity storage fails', async () => {
    hasDbMock.mockReturnValue(true);
    enforceOrderVelocityLimitMock.mockRejectedValue(new Error('Redis unavailable'));

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(res.status).toBe(503);
    expect(clearIdempotentRequestMock).toHaveBeenCalledWith(
      'storefront-order-create',
      'submission-key',
    );
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
  });

  it('returns the committed order when Redis completion recording fails', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    completeIdempotentRequestMock.mockRejectedValue(new Error('Redis unavailable'));

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(res.status).toBe(201);
    expect(createStorefrontOrderMock).toHaveBeenCalledOnce();
    expect(clearIdempotentRequestMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ ok: true, item: { id: 11 } });
  });

  it('returns 429 when order velocity escalates for the identity', async () => {
    hasDbMock.mockReturnValue(true);
    buildRateLimitHeadersMock.mockReturnValue({ 'retry-after': '3600' });
    enforceOrderVelocityLimitMock.mockResolvedValue({
      ok: false,
      limit: 2,
      remaining: 0,
      resetAt: Date.now() + 3_600_000,
      retryAfterSeconds: 3600,
    });
    vi.spyOn(storefrontOrderCreateRequestSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        phoneNumber1: '0550111111',
        cartProducts: ['9'],
        delivery: 0,
        state: 31,
        city: 'Oran',
        journeyId: 'journey-1',
        visitId: 'visit-1',
        sessionId: 'session-1',
      },
    } as never);

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'submission-key' },
      }),
    );

    expect(res.status).toBe(429);
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
    expect(res.headers.get('retry-after')).toBe('3600');
    await expect(res.json()).resolves.toEqual({
      error: 'Too many order attempts. Try again in about 60 minutes.',
    });
  });

  it('logs slow order creation timings without changing the response', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const performanceNowSpy = vi
      .spyOn(performance, 'now')
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

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'content-type': 'application/json', 'idempotency-key': 'submission-key' },
      }),
    );

    expect(res.status).toBe(201);
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

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(enforceOrderVelocityLimitMock).not.toHaveBeenCalled();
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      ok: true,
      item: { id: 11, publicToken: 'public-token' },
    });
  });

  it('returns retry guidance for an in-flight idempotent request without counting velocity', async () => {
    hasDbMock.mockReturnValue(true);
    beginIdempotentRequestMock.mockResolvedValue({
      kind: 'existing',
      ttlSeconds: 73,
      record: {
        status: 'processing',
        fingerprint: 'fingerprint',
        createdAt: new Date().toISOString(),
      },
    });

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(res.status).toBe(409);
    expect(res.headers.get('retry-after')).toBe('73');
    expect(enforceOrderVelocityLimitMock).not.toHaveBeenCalled();
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: 'Order request is already being processed.',
    });
  });

  it('clears a newly started idempotency record when velocity rejects the attempt', async () => {
    hasDbMock.mockReturnValue(true);
    buildRateLimitHeadersMock.mockReturnValue({ 'retry-after': '600' });
    enforceOrderVelocityLimitMock.mockResolvedValue({
      ok: false,
      limit: 2,
      remaining: 0,
      resetAt: Date.now() + 600_000,
      retryAfterSeconds: 600,
    });

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(res.status).toBe(429);
    expect(clearIdempotentRequestMock).toHaveBeenCalledWith(
      'storefront-order-create',
      'submission-key',
    );
    expect(createStorefrontOrderMock).not.toHaveBeenCalled();
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

    const res = await POST(
      new NextRequest('http://localhost/storefront/orders', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber1: '0550111111' }),
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'submission-key',
        },
      }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: 'Idempotency key already used with a different payload.',
    });
  });
});
