import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

describe('app/api/storefront/orders/route', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.STOREFRONT_API_BASE_URL;
  });

  afterEach(() => {
    delete process.env.STOREFRONT_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('proxies storefront order creation to storefront-api', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      item: { id: 11, publicToken: 'public-token' },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await POST(new NextRequest('http://localhost/api/storefront/orders', {
      method: 'POST',
      body: JSON.stringify({ firstName: 'Ada' }),
      headers: { 'content-type': 'application/json' },
    }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/storefront/orders');
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ firstName: 'Ada' }) });
    expect(init.headers.get('content-type')).toBe('application/json');
    await expect(res.json()).resolves.toEqual({ ok: true, item: { id: 11, publicToken: 'public-token' } });
  });

  it('passes through upstream validation errors', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      error: { fieldErrors: { cartProducts: ['Required'] } },
    }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await POST(new NextRequest('http://localhost/api/storefront/orders', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
    }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: { fieldErrors: { cartProducts: ['Required'] } } });
  });
});
