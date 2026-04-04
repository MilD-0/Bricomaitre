import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

describe('app/api/storefront/ecotrack/catalog/route', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.STOREFRONT_API_BASE_URL;
  });

  afterEach(() => {
    delete process.env.STOREFRONT_API_BASE_URL;
    vi.unstubAllGlobals();
  });

  it('proxies ecotrack catalog requests to storefront-api', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      wilayas: [{ wilayaId: 16, name: 'Alger' }],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    const response = await GET();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/storefront/ecotrack/catalog');
    expect(init).toMatchObject({ method: 'GET' });
    await expect(response.json()).resolves.toEqual({
      wilayas: [{ wilayaId: 16, name: 'Alger' }],
      communes: [],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    });
  });
});
