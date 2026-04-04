import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

describe('app/api/storefront/brands/route', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.STOREFRONT_API_BASE_URL;
  });

  afterEach(() => {
    delete process.env.STOREFRONT_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('proxies brand requests to storefront-api', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 3, name: 'Acme' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await GET();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/storefront/brands');
    expect(init).toMatchObject({ method: 'GET' });
    await expect(res.json()).resolves.toEqual({ items: [{ id: 3, name: 'Acme' }] });
  });
});
