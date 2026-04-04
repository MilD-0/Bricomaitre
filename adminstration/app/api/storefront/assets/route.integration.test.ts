import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

describe('app/api/storefront/assets/route', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.STOREFRONT_API_BASE_URL;
  });

  afterEach(() => {
    delete process.env.STOREFRONT_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('proxies storefront asset requests to storefront-api', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      banners: [],
      featuredGroups: [],
      productCards: [],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const res = await GET();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/storefront/assets');
    expect(init).toMatchObject({ method: 'GET' });
    await expect(res.json()).resolves.toEqual({ banners: [], featuredGroups: [], productCards: [] });
  });
});
