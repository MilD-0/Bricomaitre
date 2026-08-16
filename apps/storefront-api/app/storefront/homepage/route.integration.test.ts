import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({ hasDb: vi.fn(), getDb: vi.fn(), read: vi.fn() }));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb, getDb: mocks.getDb }));
vi.mock('@bric/storefront-core/assets', () => ({ readStorefrontHomepage: mocks.read }));
vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: { assets: 'assets', products: 'products', productsMeta: 'productsMeta' },
  createServerCache: ({ load }: { load: (...args: unknown[]) => unknown }) => load,
}));

describe('storefront homepage route', () => {
  beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()));

  it('returns a stable empty shape without a database', async () => {
    mocks.hasDb.mockReturnValue(false);
    await expect((await GET()).json()).resolves.toEqual({
      banners: [],
      topProducts: [],
      categories: [],
      productCards: [],
      brands: [],
      featuredGroups: [],
    });
  });

  it('returns the aggregated homepage and applies shared cache tags', async () => {
    const homepage = {
      banners: [{ id: 1 }],
      topProducts: [],
      categories: [],
      productCards: [],
      brands: [],
      featuredGroups: [],
    };
    mocks.hasDb.mockReturnValue(true);
    mocks.getDb.mockReturnValue({ db: true });
    mocks.read.mockResolvedValue(homepage);
    await expect((await GET()).json()).resolves.toEqual(homepage);
    expect(mocks.read).toHaveBeenCalledWith({ db: true });
  });
});
