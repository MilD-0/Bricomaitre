import { UnorderableCartError } from '@bric/storefront-core/order-commercial';
import { StorefrontOrderClaimLostError } from '@bric/storefront-core/order-idempotency';
import { after, NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  hasDb: vi.fn(),
  create: vi.fn(),
  read: vi.fn(),
  claim: vi.fn(),
  clear: vi.fn(),
  rateLimit: vi.fn(),
  velocity: vi.fn(),
  capture: vi.fn(),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  after: vi.fn(),
}));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb, getDb: () => ({ tag: 'db' }) }));
vi.mock('@bric/storefront-core/orders', () => ({
  createStorefrontOrder: mocks.create,
  readCommittedStorefrontOrder: mocks.read,
}));
vi.mock('@bric/storefront-core/order-idempotency', async (original) => ({
  ...(await original<typeof import('@bric/storefront-core/order-idempotency')>()),
  claimStorefrontOrderIdempotency: mocks.claim,
  clearStorefrontOrderIdempotency: mocks.clear,
}));
vi.mock('../../../lib/request-security', () => ({
  enforceRequestRateLimit: mocks.rateLimit,
  enforceOrderVelocityLimit: mocks.velocity,
  buildRateLimitHeaders: (result: { retryAfterSeconds?: number }) =>
    result.retryAfterSeconds ? { 'retry-after': String(result.retryAfterSeconds) } : {},
}));
vi.mock('../../../lib/sentry', () => ({
  captureStorefrontApiException: mocks.capture,
  getRequestId: () => 'request-id',
  withRequestIdHeaders: (id: string, extra = {}) => ({ 'x-request-id': id, ...extra }),
}));
const claimedAt = new Date('2026-09-06T12:00:00.000Z');
function request(body: unknown = { phoneNumber1: '0550111111' }, key = 'submission-key') {
  return new NextRequest('http://localhost/storefront/orders', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': key },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('public order creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDb.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ ok: true });
    mocks.velocity.mockResolvedValue({ ok: true });
    mocks.claim.mockResolvedValue({ kind: 'started', createdAt: claimedAt });
    mocks.clear.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ item: { id: 11, publicToken: 'public-token' } });
  });

  it.each([
    { body: '{', key: 'key', status: 400 },
    { body: { phoneNumber1: '' }, key: 'key', status: 400 },
    { body: { phoneNumber1: '0550111111' }, key: '', status: 400 },
    { body: 'x'.repeat(32_769), key: 'key', status: 413 },
  ])(
    'rejects malformed or oversized requests before claiming: $status',
    async ({ body, key, status }) => {
      const response = await POST(request(body, key));
      expect(response.status).toBe(status);
      expect(mocks.claim).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it('returns a structured unavailable response when the database or limiter is unavailable', async () => {
    mocks.hasDb.mockReturnValue(false);
    expect((await POST(request())).status).toBe(503);
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    mocks.hasDb.mockReturnValue(true);
    mocks.rateLimit.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('carries the exact durable claim generation through order creation', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      ok: true,
      item: { id: 11, publicToken: 'public-token' },
    });
    const claimOptions = mocks.claim.mock.calls[0]![1];
    expect(claimOptions).toMatchObject({
      processingTtlSeconds: 120,
      keyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(mocks.create).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({ phoneNumber1: '0550111111' }),
      expect.objectContaining({
        idempotency: {
          keyHash: claimOptions.keyHash,
          fingerprint: claimOptions.fingerprint,
          createdAt: claimedAt,
        },
        scheduleAfterCommit: after,
      }),
    );
    expect(mocks.clear).not.toHaveBeenCalled();
  });

  it('replays committed orders without creating or counting another order attempt', async () => {
    mocks.claim.mockResolvedValue({
      kind: 'completed',
      orderId: 11,
      metaResponse: { eventId: 'purchase-11' },
    });
    mocks.read.mockResolvedValue({ id: 11, publicToken: 'public-token' });
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      item: { id: 11 },
      meta: { eventId: 'purchase-11' },
    });
    expect(mocks.velocity).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('distinguishes processing retries from conflicting payloads', async () => {
    mocks.claim.mockResolvedValueOnce({ kind: 'processing', retryAfterSeconds: 37 });
    const processing = await POST(request());
    expect(processing.status).toBe(409);
    expect(processing.headers.get('retry-after')).toBe('37');
    expect(await processing.json()).toMatchObject({ code: 'processing' });
    mocks.claim.mockResolvedValueOnce({ kind: 'conflict' });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.velocity).not.toHaveBeenCalled();
  });

  it('releases only its own generation when rate limiting rejects or fails', async () => {
    mocks.velocity.mockResolvedValueOnce({ ok: false, retryAfterSeconds: 3600 });
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('3600');
    expect(mocks.clear).toHaveBeenCalledWith(
      { tag: 'db' },
      expect.objectContaining({ createdAt: claimedAt }),
    );
    mocks.velocity.mockRejectedValueOnce(new Error('Redis unavailable'));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns cart review and retryable lost-claim responses without exposing internal errors', async () => {
    mocks.create.mockRejectedValueOnce(new UnorderableCartError(1));
    const cart = await POST(request());
    expect(cart.status).toBe(409);
    expect(await cart.json()).toMatchObject({ code: 'cart_changed' });
    mocks.create.mockRejectedValueOnce(new StorefrontOrderClaimLostError());
    const lost = await POST(request());
    expect(lost.status).toBe(409);
    expect(lost.headers.get('retry-after')).toBe('1');
    mocks.create.mockRejectedValueOnce(new Error('private database details'));
    const failed = await POST(request());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('private database details');
  });

  it('rejects untrusted marketing sources before claiming an order', async () => {
    const response = await POST(
      request({
        phoneNumber1: '0550111111',
        meta: {
          semanticsVersion: 'confirmed_purchase_v1',
          leadEventId: 'event',
          eventSourceUrl: 'https://untrusted.example/checkout',
        },
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});
