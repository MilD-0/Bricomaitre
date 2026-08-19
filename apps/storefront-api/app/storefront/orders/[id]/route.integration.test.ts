import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH } from './route';

const { hasDbMock, getDbMock, readStorefrontOrderMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontOrderMock: vi.fn(),
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

    const res = await GET(
      new NextRequest('http://localhost/storefront/orders/11?token=public-token'),
      {
        params: Promise.resolve({ id: '11' }),
      },
    );

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

  it('returns 400 before data access for a malformed order id', async () => {
    const request = new NextRequest('http://localhost/storefront/orders/nope?token=public-token');
    const res = await GET(request, { params: Promise.resolve({ id: 'nope' }) });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid order id.' });
    expect(getDbMock).not.toHaveBeenCalled();
    expect(readStorefrontOrderMock).not.toHaveBeenCalled();
  });

  it('returns the storefront order for a valid token', async () => {
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontOrderMock.mockResolvedValue({
      kind: 'ok',
      item: { id: 11 },
      token: 'public-token',
    });

    const res = await GET(
      new NextRequest('http://localhost/storefront/orders/11?token=public-token'),
      {
        params: Promise.resolve({ id: '11' }),
      },
    );

    expect(readStorefrontOrderMock).toHaveBeenCalledWith({ tag: 'db' }, 11, 'public-token');
    await expect(res.json()).resolves.toEqual({ item: { id: 11 } });
  });

  it('rejects public order edits and directs customers to assisted support', async () => {
    const res = await PATCH();

    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
    await expect(res.json()).resolves.toEqual({
      error:
        'Customer order editing is not available. Please contact Bricomaitre to correct an order.',
    });
  });
});
