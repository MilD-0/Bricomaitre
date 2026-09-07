import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { unstable_cache } from 'next/cache';

import {
  fetchStorefrontCatalog,
  fetchStorefrontOrderByToken,
  fetchStorefrontProductDetail,
  fetchStorefrontProductPromo,
  getStorefrontEcotrackCatalog,
  getStorefrontProductDetail,
} from './storefront-api';
import { StorefrontUpstreamError } from './storefront-upstream';

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

const validOrder = {
  id: 42,
  publicToken: 'public-order-token-1234567890',
  purchaseEventId: 'purchase-42',
  createdAt: '2026-07-14T10:00:00.000Z',
  updatedAt: '2026-07-14T10:00:00.000Z',
  firstName: null,
  lastName: null,
  fullName: '',
  email: null,
  phoneNumber1: '0550000000',
  phoneNumber2: null,
  cartProducts: ['desk-lamp'],
  orderProducts: [
    {
      productId: 12,
      rawValue: 'desk-lamp',
      title: 'Desk Lamp',
      unitPrice: 4500,
      quantity: 1,
      lineTotal: 4500,
      thumbnailUrl: null,
      missing: false,
    },
  ],
  delivery: 0,
  state: 16,
  city: 'Alger Centre',
  homeAddress: '12 rue des Outils',
  productSubtotal: 4500,
  deliveryFee: 500,
  totalAmount: 5000,
  promoCode: null,
  promoProductId: null,
  promoOriginalSubtotal: null,
  promoDiscountAmount: 0,
  promoFinalSubtotal: null,
  note: null,
  inHouseStatus: 0,
  noAnswerCount: 0,
  confirmedAt: null,
  hasStatusHistory: false,
  statusHistory: [],
};

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((read: () => unknown) => read),
}));

describe('storefront API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(unstable_cache).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.mocked(unstable_cache).mockImplementation((read) => read);
  });

  it('server-renders an order from an opaque tracking token without exposing its ID in the request', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ item: validOrder }), { status: 200 }),
    );

    await expect(fetchStorefrontOrderByToken('public-order-token-1234567890')).resolves.toEqual(
      validOrder,
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/orders/track',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'public-order-token-1234567890' }),
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('does not request malformed public order lookups', async () => {
    await expect(fetchStorefrontOrderByToken('short')).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects malformed catalog responses as controlled upstream failures', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: 'unsafe' }] }), { status: 200 }),
    );

    await expect(
      fetchStorefrontCatalog({
        page: 1,
        limit: 25,
        search: '',
        brandId: null,
        categoryId: null,
        discounted: false,
        sortKey: 'updatedAt',
        sortDirection: 'desc',
        id: null,
        mongoId: null,
        slug: null,
      }),
    ).rejects.toMatchObject({ code: 'invalid_response', status: 200 });
  });

  it('returns null only for a real product not-found response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'Product not found.' }), {
        status: 404,
      }),
    );

    await expect(fetchStorefrontProductDetail('missing')).resolves.toBeNull();
  });

  it('caches Product Detail reads with global and requested-token invalidation tags', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(validProductResponse), {
        status: 200,
      }),
    );

    await expect(getStorefrontProductDetail(' legacy lamp ')).resolves.toEqual(
      validProductResponse,
    );

    expect(unstable_cache).toHaveBeenCalledWith(
      expect.any(Function),
      ['storefront-product', 'http://localhost:3001', 'legacy lamp'],
      {
        revalidate: 900,
        tags: ['storefront-products', 'storefront-product:legacy lamp'],
      },
    );
  });

  it('does not reuse persisted product data after changing the canonical API origin', async () => {
    const persisted = new Map<string, ReturnType<typeof getStorefrontProductDetail>>();
    vi.mocked(unstable_cache).mockImplementation((read, keyParts) => {
      return ((...args: Parameters<typeof read>) => {
        const key = JSON.stringify([keyParts, args]);
        if (!persisted.has(key)) persisted.set(key, read(...args));
        return persisted.get(key)!;
      }) as typeof read;
    });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const origin = new URL(String(input)).origin;
      return new Response(
        JSON.stringify({
          ...validProductResponse,
          item: { ...validProductResponse.item, title: origin },
        }),
      );
    });

    vi.stubEnv('STOREFRONT_API_BASE_URL', 'http://127.0.0.1:4311/');
    expect((await getStorefrontProductDetail('desk-lamp'))?.item.title).toBe(
      'http://127.0.0.1:4311',
    );
    vi.stubEnv('STOREFRONT_API_BASE_URL', 'http://127.0.0.1:14017');
    expect((await getStorefrontProductDetail('desk-lamp'))?.item.title).toBe(
      'http://127.0.0.1:14017',
    );
    vi.stubEnv('STOREFRONT_API_BASE_URL', 'http://127.0.0.1:4311');
    expect((await getStorefrontProductDetail('desk-lamp'))?.item.title).toBe(
      'http://127.0.0.1:4311',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fetches the canonical API-cached delivery catalog for checkout', async () => {
    const catalog = {
      wilayas: [{ wilayaId: 8, name: 'Béchar' }],
      communes: [
        { communeId: 0, wilayaId: 8, name: 'Abadla', postalCode: '817', hasStopDesk: false },
      ],
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
    expect(unstable_cache).not.toHaveBeenCalled();
  });

  it('validates a promotion through the canonical live checkout endpoint', async () => {
    const response = {
      ok: true,
      promo: {
        code: 'SAVE10',
        productId: 12,
        originalPrice: 5_000,
        promoPrice: 4_500,
        discountAmount: 500,
      },
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));

    await expect(fetchStorefrontProductPromo(12, ' SAVE10 ')).resolves.toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/products/12/promo?code=SAVE10',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('rejects malformed promotion lookups before requesting the API', async () => {
    await expect(fetchStorefrontProductPromo(0, 'SAVE10')).rejects.toMatchObject({
      code: 'invalid_token',
    });
    await expect(fetchStorefrontProductPromo(12, '   ')).rejects.toMatchObject({
      code: 'invalid_token',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('distinguishes invalid tokens, upstream failures, and invalid contracts', async () => {
    await expect(fetchStorefrontProductDetail('   ')).rejects.toMatchObject({
      code: 'invalid_token',
      status: null,
    });
    expect(fetch).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Unavailable' }), {
        status: 503,
      }),
    );
    await expect(fetchStorefrontProductDetail('desk-lamp')).rejects.toMatchObject({
      code: 'unavailable',
      status: 503,
    });

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ item: { id: 12 } }), {
        status: 200,
      }),
    );
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
