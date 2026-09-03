import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

describe('POST /api/orders/track', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('forwards the opaque token in a POST body without putting it in the URL', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"item":{"id":42}}', { status: 200 }));
    const token = 'public token 123456789012345';
    const response = await POST(
      new NextRequest('http://localhost/api/orders/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      }),
    );

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/orders/track',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token }),
        cache: 'no-store',
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
  });

  it('rejects malformed tokens locally with a private response', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/orders/track', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'short' }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(fetch).not.toHaveBeenCalled();
  });
});
