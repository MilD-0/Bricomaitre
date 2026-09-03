import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const { getDbMock, hasDbMock, readByTokenMock, rateLimitMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
  readByTokenMock: vi.fn(),
  rateLimitMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: getDbMock, hasDb: hasDbMock }));
vi.mock('@bric/storefront-core/orders', () => ({ readStorefrontOrderByToken: readByTokenMock }));
vi.mock('../../../../lib/request-security', () => ({
  buildRateLimitHeaders: vi.fn(() => ({ 'x-ratelimit-limit': '60' })),
  enforceRequestRateLimit: rateLimitMock,
}));

describe('POST /storefront/orders/track', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    rateLimitMock.mockResolvedValue({
      ok: true,
      limit: 60,
      remaining: 59,
      resetAt: Date.now() + 60_000,
    });
  });

  it('keeps the opaque token in the request body and returns a private response', async () => {
    const token = 'a'.repeat(64);
    readByTokenMock.mockResolvedValue({ kind: 'ok', item: { id: 42 }, token });

    const response = await POST(
      new NextRequest('http://localhost/storefront/orders/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    );

    expect(readByTokenMock).toHaveBeenCalledWith({ tag: 'db' }, token);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    await expect(response.json()).resolves.toEqual({ item: { id: 42 } });
  });

  it('uses private no-store responses for malformed and unknown tokens', async () => {
    const malformed = await POST(
      new NextRequest('http://localhost/storefront/orders/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'short' }),
      }),
    );
    expect(malformed.status).toBe(400);
    expect(malformed.headers.get('cache-control')).toBe('private, no-store');

    const token = 'b'.repeat(64);
    readByTokenMock.mockResolvedValue({ kind: 'not_found', order: null, token });
    const unknown = await POST(
      new NextRequest('http://localhost/storefront/orders/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    );
    expect(unknown.status).toBe(404);
    expect(unknown.headers.get('cache-control')).toBe('private, no-store');
  });
});
