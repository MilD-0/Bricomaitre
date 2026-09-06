vi.mock('next/cache', () => ({ unstable_cache: (load: (...args: unknown[]) => unknown) => load }));

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasDb: vi.fn(),
  assets: vi.fn(),
  brands: vi.fn(),
  categories: vi.fn(),
  homepage: vi.fn(),
  delivery: vi.fn(),
  buildFeed: vi.fn(),
  db: { marker: 'catalog-db' },
}));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb, getDb: () => mocks.db }));
vi.mock('@bric/storefront-core/assets', () => ({
  readStorefrontAssets: mocks.assets,
  readStorefrontHomepage: mocks.homepage,
}));
vi.mock('@bric/storefront-core/catalog', () => ({
  readStorefrontBrands: mocks.brands,
  readStorefrontCategories: mocks.categories,
  readStorefrontProductBuildFeed: mocks.buildFeed,
}));
vi.mock('@bric/storefront-core/ecotrack-catalog', () => ({
  readStorefrontEcotrackCatalog: mocks.delivery,
}));
vi.mock('@bric/storefront-core/server-cache', async (original) => ({
  ...(await original<typeof import('@bric/storefront-core/server-cache')>()),
}));

import { GET as assets } from './assets/route';
import { GET as brands } from './brands/route';
import { GET as categories } from './categories/route';
import { GET as homepage } from './homepage/route';
import { GET as delivery } from './ecotrack/catalog/route';
import { GET as buildFeed } from './products/build-feed/route';

// These routes own readiness and the HTTP envelope. DTO serialization and
// catalog selection are exercised by the shared service and database tests.
const assetResult = { banners: [], featuredGroups: [], productCards: [] };
const homepageResult = { ...assetResult, brands: [], categories: [], topProducts: [] };
const deliveryResult = {
  wilayas: [],
  communes: [],
  serviceFees: [],
  weightFees: [],
  lastSync: null,
};
const items = [{ id: 7 }];
const routes = [
  { name: 'assets', get: assets, load: mocks.assets, result: assetResult, body: assetResult },
  { name: 'brands', get: brands, load: mocks.brands, result: items, body: { items } },
  { name: 'categories', get: categories, load: mocks.categories, result: items, body: { items } },
  {
    name: 'homepage',
    get: homepage,
    load: mocks.homepage,
    result: homepageResult,
    body: homepageResult,
  },
  {
    name: 'delivery',
    get: delivery,
    load: mocks.delivery,
    result: deliveryResult,
    body: deliveryResult,
  },
  { name: 'build feed', get: buildFeed, load: mocks.buildFeed, result: items, body: { items } },
];

describe.each(routes)('$name route', ({ get, load, result, body }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDb.mockReturnValue(true);
    load.mockResolvedValue(result);
  });

  it('returns the shared service result in its public envelope', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(body);
    expect(load).toHaveBeenCalledWith(mocks.db);
  });

  it('reports an unavailable database before loading data', async () => {
    mocks.hasDb.mockReturnValue(false);
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Storefront database is unavailable.' });
    expect(load).not.toHaveBeenCalled();
  });
});

it('allows HTTP caching of the shared delivery catalog', async () => {
  mocks.hasDb.mockReturnValue(true);
  mocks.delivery.mockResolvedValue(deliveryResult);
  const response = await delivery();
  expect(response.headers.get('cache-control')).toBe(
    'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  );
});
