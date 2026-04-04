import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH } from './route';
import { storefrontOrderPatchRequestSchema } from '@bric/storefront-core/contracts';

const { hasDbMock, getDbMock, readStorefrontOrderMock, updateStorefrontOrderMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontOrderMock: vi.fn(),
  updateStorefrontOrderMock: vi.fn(),
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
  readStorefrontOrder: readStorefrontOrderMock,
  updateStorefrontOrder: updateStorefrontOrderMock,
}));

vi.mock('../../../../lib/request-security', () => ({
  buildRateLimitHeaders: buildRateLimitHeadersMock,
  enforceRequestRateLimit: enforceRequestRateLimitMock,
}));

describe('app/storefront/orders/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontOrderMock.mockReset();
    updateStorefrontOrderMock.mockReset();
    buildRateLimitHeadersMock.mockReset();
    enforceRequestRateLimitMock.mockReset();
    hasDbMock.mockReturnValue(true);
    buildRateLimitHeadersMock.mockReturnValue({});
    enforceRequestRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 60,
      remaining: 59,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  it('returns 503 when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/storefront/orders/11?token=public-token'), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns 401 when the storefront order token is missing or invalid', async () => {
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontOrderMock.mockResolvedValue({
      kind: 'missing_token',
      order: null,
      token: null,
    });

    const res = await GET(new NextRequest('http://localhost/storefront/orders/11'), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Order token is required' });
  });

  it('returns the storefront order for a valid token', async () => {
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontOrderMock.mockResolvedValue({
      kind: 'ok',
      item: { id: 11 },
      token: 'public-token',
    });

    const res = await GET(new NextRequest('http://localhost/storefront/orders/11?token=public-token'), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(readStorefrontOrderMock).toHaveBeenCalledWith({ tag: 'db' }, 11, 'public-token');
    await expect(res.json()).resolves.toEqual({ item: { id: 11 } });
  });

  it('returns validation errors for invalid storefront PATCH payloads', async () => {
    vi.spyOn(storefrontOrderPatchRequestSchema, 'safeParse').mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { cartProducts: ['Required'] } }) },
    } as never);

    const res = await PATCH(new NextRequest('http://localhost/storefront/orders/11', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: { fieldErrors: { cartProducts: ['Required'] } } });
  });

  it('patches a storefront order with a valid token', async () => {
    getDbMock.mockReturnValue({ tag: 'db' });
    vi.spyOn(storefrontOrderPatchRequestSchema, 'safeParse').mockReturnValue({
      success: true,
      data: {
        city: 'Oran',
        delivery: 1,
      },
    } as never);
    updateStorefrontOrderMock.mockResolvedValue({
      kind: 'ok',
      item: { id: 11 },
      token: 'public-token',
    });

    const res = await PATCH(new NextRequest('http://localhost/storefront/orders/11?token=public-token', {
      method: 'PATCH',
      body: JSON.stringify({ city: 'Oran', delivery: 1 }),
      headers: { 'content-type': 'application/json' },
    }), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(updateStorefrontOrderMock).toHaveBeenCalledWith(
      { tag: 'db' },
      11,
      'public-token',
      { city: 'Oran', delivery: 1 },
    );
    await expect(res.json()).resolves.toEqual({ ok: true, item: { id: 11 } });
  });
});
