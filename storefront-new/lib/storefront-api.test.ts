import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cacheLife, cacheTag } from 'next/cache';

import {
  fetchStorefrontCatalog,
  fetchStorefrontCatalogMeta,
  fetchStorefrontHomepage,
  fetchStorefrontHomepageFeaturedGroupProducts,
  fetchStorefrontSitemapProducts,
  fetchStorefrontSettings,
  getStorefrontEcotrackCatalog,
  fetchStorefrontProductDetail,
  getStorefrontProductDetail,
} from './storefront-api';
import {
  getStorefrontApiBaseUrl,
  getStorefrontApiTimeoutMs,
  StorefrontUpstreamError,
} from './storefront-upstream';

const validProductResponse = {
  item: {
    id: 12,
    canonicalToken: 'desk-lamp',
    title: 'Desk Lamp',
    titleAr: 'مصباح مكتب',
    description: 'Warm light',
    descriptionAr: null,
    sku: 'DL-1',
    barcode: null,
    price: '1500.00',
    oldPrice: null,
    availability: {
      status: 'in_stock',
      inStock: true,
      quantity: 4,
    },
    media: [],
    brand: null,
    category: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
  },
  resolution: {
    requestedToken: 'legacy lamp',
    matchedBy: 'mongoId',
    canonicalToken: 'desk-lamp',
  },
};

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

describe('storefront API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(cacheLife).mockReset();
    vi.mocked(cacheTag).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes configuration and applies safe timeout defaults', () => {
    expect(getStorefrontApiBaseUrl({ STOREFRONT_API_BASE_URL: ' https://api.example.com/// ' })).toBe(
      'https://api.example.com',
    );
    expect(getStorefrontApiTimeoutMs({ STOREFRONT_API_TIMEOUT_MS: '2500' })).toBe(2500);
    expect(getStorefrontApiTimeoutMs({ STOREFRONT_API_TIMEOUT_MS: '-1' })).toBe(5000);
  });

  it('fetches an encoded token and validates the shared response contract', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(validProductResponse), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(fetchStorefrontProductDetail(' legacy lamp ')).resolves.toEqual(validProductResponse);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/products/legacy%20lamp',
      expect.objectContaining({
        headers: expect.objectContaining({ accept: 'application/json' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('forwards a validated catalog query and validates listing metadata contracts', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], total: 86 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    await expect(fetchStorefrontCatalog({
      page: 2,
      limit: 25,
      search: 'marteau',
      brandId: 2,
      categoryId: 3,
      sortKey: 'price',
      sortDirection: 'asc',
      id: null,
      mongoId: null,
      slug: null,
    })).resolves.toEqual({ items: [], total: 86 });
    await expect(fetchStorefrontCatalogMeta()).resolves.toEqual({ brands: [], categories: [] });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/storefront/products?page=2&limit=25&sortKey=price&sortDirection=asc&search=marteau&brandId=2&categoryId=3',
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(2, 'http://localhost:3001/storefront/brands', expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(3, 'http://localhost:3001/storefront/categories', expect.any(Object));
  });

  it('fetches and validates the aggregated homepage contract', async () => {
    const homepage = { banners: [], topProducts: [], categories: [], productCards: [], brands: [], featuredGroups: [] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(homepage), { status: 200 }));
    await expect(fetchStorefrontHomepage()).resolves.toEqual(homepage);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3001/storefront/homepage', expect.any(Object));
  });

  it('fetches the next bounded page of a featured group on demand', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [], total: 24 }), { status: 200 }));
    await expect(fetchStorefrontHomepageFeaturedGroupProducts(8, { page: 2, limit: 12 })).resolves.toEqual({ items: [], total: 24 });
    expect(fetch).toHaveBeenCalledWith('http://localhost:3001/storefront/homepage/groups/8?page=2&limit=12', expect.any(Object));
  });

  it('reads every active catalog page for sitemap generation', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...validProductResponse.item, slug: 'first', mongoId: null, titleAr: null, active: true, inStock: true, availabilityStatus: 'in_stock', inventoryQuantity: 1, brandId: null, categoryId: null, images: [], oldPrice: null }], total: 201 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...validProductResponse.item, id: 13, slug: 'second', mongoId: null, titleAr: null, active: true, inStock: true, availabilityStatus: 'in_stock', inventoryQuantity: 1, brandId: null, categoryId: null, images: [], oldPrice: null }], total: 201 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ ...validProductResponse.item, id: 14, slug: 'third', mongoId: null, titleAr: null, active: true, inStock: true, availabilityStatus: 'in_stock', inventoryQuantity: 1, brandId: null, categoryId: null, images: [], oldPrice: null }], total: 201 }), { status: 200 }));

    const items = await fetchStorefrontSitemapProducts();

    expect(items.map((item) => item.slug)).toEqual(['first', 'second', 'third']);
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining('page=1&limit=100'), expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('page=2&limit=100'), expect.any(Object));
    expect(fetch).toHaveBeenNthCalledWith(3, expect.stringContaining('page=3&limit=100'), expect.any(Object));
  });

  it('fetches and validates public contact settings', async () => {
    const settings = {
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(settings), { status: 200 }));

    await expect(fetchStorefrontSettings()).resolves.toEqual(settings);
    expect(fetch).toHaveBeenCalledWith('http://localhost:3001/storefront/settings', expect.any(Object));
  });

  it('rejects malformed catalog responses as controlled upstream failures', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: [{ id: 'unsafe' }] }), { status: 200 }));

    await expect(fetchStorefrontCatalog({
      page: 1,
      limit: 25,
      search: '',
      brandId: null,
      categoryId: null,
      sortKey: 'updatedAt',
      sortDirection: 'desc',
      id: null,
      mongoId: null,
      slug: null,
    })).rejects.toMatchObject({ code: 'invalid_response', status: 200 });
  });

  it('returns null only for a real product not-found response', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Product not found.' }), {
      status: 404,
    }));

    await expect(fetchStorefrontProductDetail('missing')).resolves.toBeNull();
  });

  it('caches Product Detail reads with global, requested, and canonical tags', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(validProductResponse), {
      status: 200,
    }));

    await expect(getStorefrontProductDetail(' legacy lamp ')).resolves.toEqual(validProductResponse);

    expect(cacheLife).toHaveBeenCalledWith({ stale: 30, revalidate: 60, expire: 300 });
    expect(cacheTag).toHaveBeenNthCalledWith(
      1,
      'storefront-new-products',
      'storefront-new-product:legacy lamp',
    );
    expect(cacheTag).toHaveBeenNthCalledWith(2, 'storefront-new-product:desk-lamp');
  });

  it('fetches the canonical API-cached delivery catalog for checkout', async () => {
    const catalog = {
      wilayas: [{ wilayaId: 8, name: 'Béchar' }],
      communes: [{ communeId: 0, wilayaId: 8, name: 'Abadla', postalCode: '817', hasStopDesk: false }],
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(catalog), { status: 200 }));

    await expect(getStorefrontEcotrackCatalog()).resolves.toEqual(catalog);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/ecotrack/catalog',
      expect.any(Object),
    );
    expect(cacheLife).not.toHaveBeenCalled();
    expect(cacheTag).not.toHaveBeenCalled();
  });

  it('distinguishes invalid tokens, upstream failures, and invalid contracts', async () => {
    await expect(fetchStorefrontProductDetail('   ')).rejects.toMatchObject({
      code: 'invalid_token',
      status: null,
    });
    expect(fetch).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Unavailable' }), {
      status: 503,
    }));
    await expect(fetchStorefrontProductDetail('desk-lamp')).rejects.toMatchObject({
      code: 'unavailable',
      status: 503,
    });

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ item: { id: 12 } }), {
      status: 200,
    }));
    await expect(fetchStorefrontProductDetail('desk-lamp')).rejects.toMatchObject({
      code: 'invalid_response',
      status: 200,
    });
  });

  it('wraps network errors without leaking fetch implementation details', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('connection refused'));

    const error = await fetchStorefrontProductDetail('desk-lamp').catch((caught) => caught);
    expect(error).toBeInstanceOf(StorefrontUpstreamError);
    expect(error).toMatchObject({
      code: 'unavailable',
      pathname: '/storefront/products/desk-lamp',
      status: null,
    });
  });
});
