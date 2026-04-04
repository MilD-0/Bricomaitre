import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, PATCH } from './route';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

describe('app/api/storefront/orders/[id]/route', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.STOREFRONT_API_BASE_URL;
  });

  afterEach(() => {
    delete process.env.STOREFRONT_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('proxies storefront order reads and preserves query token semantics', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      item: { id: 11 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await GET(new NextRequest('http://localhost/api/storefront/orders/11?token=public-token'), {
      params: Promise.resolve({ id: '11' }),
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/storefront/orders/11?token=public-token');
    expect(init).toMatchObject({ method: 'GET' });
    await expect(res.json()).resolves.toEqual({ item: { id: 11 } });
  });

  it('passes through missing token errors from storefront-api', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      error: 'Order token is required',
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await GET(new NextRequest('http://localhost/api/storefront/orders/11'), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Order token is required' });
  });

  it('proxies storefront order updates and forwards token headers', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: { id: 11 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await PATCH(new NextRequest('http://localhost/api/storefront/orders/11', {
      method: 'PATCH',
      body: JSON.stringify({ city: 'Oran', delivery: 1 }),
      headers: {
        'content-type': 'application/json',
        'x-order-token': 'public-token',
      },
    }), {
      params: Promise.resolve({ id: '11' }),
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/storefront/orders/11');
    expect(init).toMatchObject({ method: 'PATCH', body: JSON.stringify({ city: 'Oran', delivery: 1 }) });
    expect(init.headers.get('x-order-token')).toBe('public-token');
    await expect(res.json()).resolves.toEqual({ ok: true, item: { id: 11 } });
  });
});
