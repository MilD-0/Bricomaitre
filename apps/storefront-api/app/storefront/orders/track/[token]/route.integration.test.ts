import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { getDbMock, hasDbMock, readByTokenMock, rateLimitMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
  readByTokenMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: getDbMock, hasDb: hasDbMock }));
vi.mock('@bric/storefront-core/orders', () => ({ readStorefrontOrderByToken: readByTokenMock }));
vi.mock('../../../../../lib/request-security', () => ({
  buildRateLimitHeaders: vi.fn(() => ({})),
  enforceRequestRateLimit: rateLimitMock,
}));

describe('GET /storefront/orders/track/:token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    rateLimitMock.mockResolvedValue({
      ok: true,
      limit: 60,
      remaining: 59,
      resetAt: new Date().toISOString(),
    });
  });

  it('resolves an order using only its opaque public token', async () => {
    const token = 'a'.repeat(64);
    readByTokenMock.mockResolvedValue({ kind: 'ok', item: { id: 42 }, token });

    const response = await GET(
      new NextRequest(`http://localhost/storefront/orders/track/${token}`),
      {
        params: Promise.resolve({ token }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(readByTokenMock).toHaveBeenCalledWith({ tag: 'db' }, token);
    await expect(response.json()).resolves.toEqual({ item: { id: 42 } });
  });

  it('does not reveal whether malformed or unknown tokens exist', async () => {
    const malformed = await GET(new NextRequest('http://localhost/storefront/orders/track/short'), {
      params: Promise.resolve({ token: 'short' }),
    });
    expect(malformed.status).toBe(404);
    expect(readByTokenMock).not.toHaveBeenCalled();

    const token = 'b'.repeat(64);
    readByTokenMock.mockResolvedValue({ kind: 'not_found', order: null, token });
    const unknown = await GET(
      new NextRequest(`http://localhost/storefront/orders/track/${token}`),
      {
        params: Promise.resolve({ token }),
      },
    );
    expect(unknown.status).toBe(404);
  });
});
