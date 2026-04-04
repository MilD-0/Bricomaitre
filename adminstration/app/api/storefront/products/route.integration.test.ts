import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

describe('app/api/storefront/products/route', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.STOREFRONT_API_BASE_URL;
  });

  afterEach(() => {
    delete process.env.STOREFRONT_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('proxies product list requests to storefront-api and passes through the response body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      items: [
        {
          id: 1,
          slug: 'desk-lamp',
          title: 'Desk Lamp',
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await GET(new NextRequest('http://localhost/api/storefront/products?search=lamp'));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/storefront/products?search=lamp');
    expect(init).toMatchObject({ method: 'GET' });
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 1,
          slug: 'desk-lamp',
          title: 'Desk Lamp',
        },
      ],
    });
  });

  it('returns a gateway error when storefront-api is unavailable', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const res = await GET(new NextRequest('http://localhost/api/storefront/products'));

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ error: 'Storefront API is unavailable' });
  });
});
