import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

describe('app/api/storefront/categories/route', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.STOREFRONT_API_BASE_URL;
  });

  afterEach(() => {
    delete process.env.STOREFRONT_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('proxies category requests to storefront-api', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: 4, name: 'Lighting' }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await GET();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/storefront/categories');
    expect(init).toMatchObject({ method: 'GET' });
    await expect(res.json()).resolves.toEqual({ items: [{ id: 4, name: 'Lighting' }] });
  });
});
