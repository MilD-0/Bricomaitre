import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({ hasDb: vi.fn(), getDb: vi.fn(), read: vi.fn(), cache: vi.fn() }));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb, getDb: mocks.getDb }));
vi.mock('@bric/storefront-core/assets', () => ({ readStorefrontHomepageFeaturedGroupProducts: mocks.read }));
vi.mock('@bric/storefront-core/server-cache', () => ({ CACHE_TAGS: { assets: 'assets', products: 'products', productsMeta: 'productsMeta' }, applyServerCache: mocks.cache }));

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('storefront homepage featured group route', () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()));

  it('serves a bounded progressive page and cache tags', async () => {
    mocks.hasDb.mockReturnValue(true);
    mocks.getDb.mockReturnValue({ db: true });
    mocks.read.mockResolvedValue({ items: [{ id: 7 }], total: 31 });

    const response = await GET(new NextRequest('http://localhost/storefront/homepage/groups/2?page=3&limit=12'), context('2'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [{ id: 7 }], total: 31 });
    expect(mocks.read).toHaveBeenCalledWith({ db: true }, 2, 3, 12);
    expect(mocks.cache).toHaveBeenCalledWith(expect.any(Object), 'assets', 'products', 'productsMeta');
  });

  it('rejects invalid group identifiers and handles a missing database', async () => {
    const invalid = await GET(new NextRequest('http://localhost/storefront/homepage/groups/nope'), context('nope'));
    expect(invalid.status).toBe(400);

    mocks.hasDb.mockReturnValue(false);
    const empty = await GET(new NextRequest('http://localhost/storefront/homepage/groups/2'), context('2'));
    await expect(empty.json()).resolves.toEqual({ items: [], total: 0 });
  });
});
