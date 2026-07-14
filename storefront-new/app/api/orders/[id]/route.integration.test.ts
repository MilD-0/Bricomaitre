import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

describe('GET /api/orders/:id', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('rejects invalid IDs and short tokens locally', async () => {
    const response = await GET(new NextRequest('http://localhost/api/orders/nope?token=short'), { params: Promise.resolve({ id: 'nope' }) });
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards an encoded public token without caching', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"item":{"id":42}}', { status: 200 }));
    const token = 'public token 123456789012345';
    const response = await GET(new NextRequest(`http://localhost/api/orders/42?token=${encodeURIComponent(token)}`), { params: Promise.resolve({ id: '42' }) });
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3001/storefront/orders/42?token=${encodeURIComponent(token)}`,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('does not turn an upstream outage into an unhandled page error', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    const response = await GET(new NextRequest('http://localhost/api/orders/42?token=public-order-token-1234567890'), { params: Promise.resolve({ id: '42' }) });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'order_verification_unavailable' });
  });
});
