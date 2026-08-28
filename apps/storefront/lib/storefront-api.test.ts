import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { unstable_cache } from 'next/cache';

import {
  fetchStorefrontCatalog,
  fetchStorefrontCatalogMeta,
  fetchStorefrontAssets,
  fetchStorefrontHomepage,
  fetchStorefrontHomepageFeaturedGroupProducts,
  fetchStorefrontProductPromo,
  fetchStorefrontOrder,
  fetchStorefrontOrderByToken,
  fetchStorefrontSitemapProducts,
  fetchStorefrontSettings,
  getStorefrontSettings,
  getStorefrontEcotrackCatalog,
  fetchStorefrontProductDetail,
  getStorefrontProductDetail,
  getStorefrontLandingPage,
  buildStorefrontLandingPagePath,
  recordStorefrontAssistantRun,
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
  confirmed: 0,
  noAnswerCount: 0,
  confirmedAt: null,
  hasStatusHistory: false,
  statusHistory: [],
};

const validLandingPage = {
  id: 4,
  slug: 'lampe-atelier',
  locale: 'fr',
  revision: 3,
  publishedAt: null,
  document: {
    schemaVersion: 1,
    theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
    seo: {
      title: 'Lampe atelier',
      description: 'Une campagne pour la lampe atelier.',
      indexable: false,
    },
    blocks: [
      {
        id: 'hero',
        type: 'product-hero',
        variant: 'media-left',
        heading: 'Éclairez chaque chantier',
        subheading: '',
        imageUrl: null,
        imageAlt: '',
        primaryCtaLabel: 'Commander',
        showAddToCart: true,
      },
      {
        id: 'final',
        type: 'final-cta',
        variant: 'solid',
        heading: 'Commandez maintenant',
        body: '',
        primaryCtaLabel: 'Commander',
        imageUrl: null,
        imageAlt: '',
      },
    ],
  },
  product: validProductResponse.item,
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
  });

  it('normalizes configuration and applies safe timeout defaults', () => {
    expect(
      getStorefrontApiBaseUrl({ STOREFRONT_API_BASE_URL: ' https://api.example.com/// ' }),
    ).toBe('https://api.example.com');
    expect(getStorefrontApiTimeoutMs({ STOREFRONT_API_TIMEOUT_MS: '2500' })).toBe(2500);
    expect(getStorefrontApiTimeoutMs({ STOREFRONT_API_TIMEOUT_MS: '-1' })).toBe(5000);
  });

  it('fetches an encoded token and validates the shared response contract', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(validProductResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchStorefrontProductDetail(' legacy lamp ')).resolves.toEqual(
      validProductResponse,
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/products/legacy%20lamp',
      expect.objectContaining({
        headers: expect.objectContaining({ accept: 'application/json' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('forwards signed landing-page previews without putting them in the shared cache', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(validLandingPage), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const preview = {
      revision: 3,
      timestamp: '1787817600000',
      signature: 'a'.repeat(64),
    };

    expect(buildStorefrontLandingPagePath('fr', 'lampe-atelier', preview)).toBe(
      `/storefront/landing-pages/lampe-atelier?locale=fr&previewRevision=3&previewTimestamp=1787817600000&previewSignature=${'a'.repeat(64)}`,
    );
    await expect(getStorefrontLandingPage('fr', 'lampe-atelier', preview)).resolves.toMatchObject({
      revision: 3,
      publishedAt: null,
    });
    expect(unstable_cache).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3001/storefront/landing-pages/lampe-atelier?locale=fr&previewRevision=3&previewTimestamp=1787817600000&previewSignature=${'a'.repeat(64)}`,
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('forwards a validated catalog query and validates listing metadata contracts', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], total: 86 }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    await expect(
      fetchStorefrontCatalog({
        page: 2,
        limit: 25,
        search: 'marteau',
        brandId: 2,
        categoryId: 3,
        discounted: true,
        sortKey: 'price',
        sortDirection: 'asc',
        id: null,
        mongoId: null,
        slug: null,
      }),
    ).resolves.toEqual({ items: [], total: 86 });
    await expect(fetchStorefrontCatalogMeta()).resolves.toEqual({ brands: [], categories: [] });

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3001/storefront/products?page=2&limit=25&sortKey=price&sortDirection=asc&search=marteau&brandId=2&categoryId=3&discounted=1',
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/storefront/brands',
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3001/storefront/categories',
      expect.any(Object),
    );
  });

  it('fetches and validates the aggregated homepage contract', async () => {
    const homepage = {
      banners: [],
      topProducts: [],
      categories: [],
      productCards: [],
      brands: [],
      featuredGroups: [],
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(homepage), { status: 200 }));
    await expect(fetchStorefrontHomepage()).resolves.toEqual(homepage);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/homepage',
      expect.any(Object),
    );
  });

  it('fetches the managed public assets used by product surfaces', async () => {
    const assets = { banners: [], featuredGroups: [], productCards: [] };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(assets), { status: 200 }));

    await expect(fetchStorefrontAssets()).resolves.toEqual(assets);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/assets',
      expect.any(Object),
    );
  });

  it('fetches the next bounded page of a featured group on demand', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 24 }), { status: 200 }),
    );
    await expect(
      fetchStorefrontHomepageFeaturedGroupProducts(8, { page: 2, limit: 12 }),
    ).resolves.toEqual({ items: [], total: 24 });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/homepage/groups/8?page=2&limit=12',
      expect.any(Object),
    );
  });

  it('reads every active catalog page for sitemap generation', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                ...validProductResponse.item,
                slug: 'first',
                mongoId: null,
                titleAr: null,
                active: true,
                inStock: true,
                availabilityStatus: 'in_stock',
                inventoryQuantity: 1,
                brandId: null,
                categoryId: null,
                images: [],
                oldPrice: null,
              },
            ],
            total: 201,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                ...validProductResponse.item,
                id: 13,
                slug: 'second',
                mongoId: null,
                titleAr: null,
                active: true,
                inStock: true,
                availabilityStatus: 'in_stock',
                inventoryQuantity: 1,
                brandId: null,
                categoryId: null,
                images: [],
                oldPrice: null,
              },
            ],
            total: 201,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                ...validProductResponse.item,
                id: 14,
                slug: 'third',
                mongoId: null,
                titleAr: null,
                active: true,
                inStock: true,
                availabilityStatus: 'in_stock',
                inventoryQuantity: 1,
                brandId: null,
                categoryId: null,
                images: [],
                oldPrice: null,
              },
            ],
            total: 201,
          }),
          { status: 200 },
        ),
      );

    const items = await fetchStorefrontSitemapProducts();

    expect(items.map((item) => item.slug)).toEqual(['first', 'second', 'third']);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('page=1&limit=100'),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('page=2&limit=100'),
      expect.any(Object),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('page=3&limit=100'),
      expect.any(Object),
    );
  });

  it('fetches and validates public contact settings', async () => {
    const settings = {
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(settings), { status: 200 }));

    await expect(fetchStorefrontSettings()).resolves.toMatchObject({
      ...settings,
      aiAssistantEnabled: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/settings',
      expect.any(Object),
    );
  });

  it('uses public defaults when the previous API release does not yet expose settings', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    await expect(fetchStorefrontSettings()).resolves.toMatchObject({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
      aiAssistantEnabled: true,
    });
  });

  it('keeps cached public settings available during a rolling API timeout', async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException('timed out', 'AbortError'));

    await expect(getStorefrontSettings()).resolves.toMatchObject({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
      aiAssistantEnabled: true,
    });
  });

  it('records the complete assistant conversation through the canonical analytics endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 202 }));

    await recordStorefrontAssistantRun({
      telemetry: {
        journeyId: 'journey-1',
        sessionId: 'session-1',
        pagePath: '/fr/products',
        intent: 'product_search',
      },
      locale: 'fr',
      status: 'completed',
      mode: 'ai',
      model: 'storefront-model-id',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      durationMs: 420,
      toolCalls: 1,
      resultsCount: 2,
      promptVersion: 'storefront-shopping-v2',
      conversation: [{ role: 'user', content: 'Find a drill' }],
      response: 'These drills match your request.',
    });

    const [url, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:3001/storefront/analytics');
    const payload = JSON.parse(String(options?.body));
    expect(payload).toMatchObject({
      eventName: 'ai_assistant_run',
      journeyId: 'journey-1',
      sessionId: 'session-1',
      metadata: {
        storefrontProject: 'storefront',
        intent: 'product_search',
        model: 'storefront-model-id',
        totalTokens: 15,
        durationMs: 420,
        toolCalls: 1,
        promptVersion: 'storefront-shopping-v2',
        conversation: [{ role: 'user', content: 'Find a drill' }],
        response: 'These drills match your request.',
      },
    });
  });

  it('server-renders a token-verified order without caching the customer response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ item: validOrder }), { status: 200 }),
    );

    await expect(fetchStorefrontOrder(42, 'public-order-token-1234567890')).resolves.toEqual(
      validOrder,
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/orders/42?token=public-order-token-1234567890',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
  });

  it('server-renders an order from an opaque tracking token without exposing its ID in the request', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ item: validOrder }), { status: 200 }),
    );

    await expect(fetchStorefrontOrderByToken('public-order-token-1234567890')).resolves.toEqual(
      validOrder,
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3001/storefront/orders/track/public-order-token-1234567890',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    );
  });

  it('does not request malformed public order lookups', async () => {
    await expect(fetchStorefrontOrder(0, 'short')).resolves.toBeNull();
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
      ['storefront-product', 'legacy lamp'],
      {
        revalidate: 900,
        tags: ['storefront-products', 'storefront-product:legacy lamp'],
      },
    );
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
