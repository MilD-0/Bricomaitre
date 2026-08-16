import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const fetchCatalog = vi.hoisted(() => vi.fn());
vi.mock('@/lib/storefront-api', () => ({ fetchStorefrontCatalog: fetchCatalog }));

const product = (id: number) => ({ id });

describe('GET /api/catalog', () => {
  beforeEach(() => fetchCatalog.mockReset());

  it('normalizes the public query and returns one bounded infinite-scroll page', async () => {
    fetchCatalog.mockResolvedValue({
      items: Array.from({ length: 7 }, (_, index) => product(index + 1)),
      total: 48,
    });
    const response = await GET(
      new NextRequest(
        'http://localhost/api/catalog?q=drill&category=3&discounted=1&sort=price-asc&page=2&limit=6',
      ),
    );

    expect(response.status).toBe(200);
    expect(fetchCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'drill',
        categoryId: 3,
        discounted: true,
        page: 2,
        limit: 6,
        sortKey: 'price',
        sortDirection: 'asc',
      }),
    );
    const payload = await response.json();
    expect(payload).toMatchObject({
      page: 2,
      total: 48,
      hasNextPage: true,
      items: expect.arrayContaining([product(1)]),
    });
    expect(payload.items).toHaveLength(6);
  });

  it('returns a recoverable response when an upstream result cannot be served', async () => {
    fetchCatalog.mockResolvedValue({
      get items() {
        throw new Error('upstream response unavailable');
      },
    });
    const response = await GET(new NextRequest('http://localhost/api/catalog?page=2'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'catalog_unavailable' });
  });
});
