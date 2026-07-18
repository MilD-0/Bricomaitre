import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

describe('GET /api/orders/track/:token', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('forwards only the encoded opaque token without caching', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"item":{"id":42}}', { status: 200 }));
    const token = 'public token 123456789012345';
    const response = await GET(new NextRequest(`http://localhost/api/orders/track/${encodeURIComponent(token)}`), {
      params: Promise.resolve({ token }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3001/storefront/orders/track/${encodeURIComponent(token)}`,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('rejects short tokens locally', async () => {
    const response = await GET(new NextRequest('http://localhost/api/orders/track/short'), {
      params: Promise.resolve({ token: 'short' }),
    });
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
