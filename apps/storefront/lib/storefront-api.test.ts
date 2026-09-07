import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { unstable_cache } from 'next/cache';

import {
  buildStorefrontLandingPagePath,
  fetchStorefrontAssets,
  fetchStorefrontCatalog,
  fetchStorefrontCatalogMeta,
  fetchStorefrontHomepage,
  fetchStorefrontHomepageFeaturedGroupProducts,
  fetchStorefrontProductDetail,
  fetchStorefrontSettings,
  fetchStorefrontSitemapProducts,
  getRequiredStorefrontSettings,
  getStorefrontLandingPage,
  getStorefrontSettings,
  recordStorefrontAssistantRun,
} from './storefront-api';
import {
  fetchStorefrontUpstream,
  getStorefrontApiBaseUrl,
  getStorefrontApiTimeoutMs,
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
    vi.unstubAllEnvs();
    vi.mocked(unstable_cache).mockImplementation((read) => read);
  });

  it('keeps the upstream deadline active when headers arrive but the body stalls', async () => {
    vi.mocked(fetch).mockImplementation(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener('abort', () =>
                controller.error(new DOMException('Aborted', 'AbortError')),
              );
            },
          }),
        ),
    );
    await expect(
      fetchStorefrontUpstream('/storefront/settings', { timeoutMs: 10 }),
    ).rejects.toMatchObject({ code: 'unavailable', message: expect.stringContaining('timed out') });
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

  it('reads the complete minimal product feed in one request for the sitemap', async () => {
    const products = Array.from({ length: 201 }, (_, index) => ({
      id: index + 1,
      slug: `product-${index + 1}`,
      mongoId: null,
      updatedAt: '2026-07-02T10:00:00.000Z',
    }));
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ items: products })));

    await expect(fetchStorefrontSitemapProducts()).resolves.toEqual(products);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      'http://localhost:3001/storefront/products/build-feed',
      expect.any(Object),
    );
  });

  it('rejects a malformed discovery feed instead of publishing invalid product URLs', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ items: [{ id: 12, slug: 'lamp', mongoId: null }] })),
    );
    await expect(fetchStorefrontSitemapProducts()).rejects.toMatchObject({
      code: 'invalid_response',
    });
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

  it('keeps missing settings unavailable to callers that require verified configuration', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(fetchStorefrontSettings()).rejects.toMatchObject({ status: 404 });
    await expect(getRequiredStorefrontSettings()).rejects.toMatchObject({ status: 404 });
    await expect(getStorefrontSettings()).resolves.toMatchObject({ phoneEnabled: true });
  });

  it('recovers from an outage without caching UI defaults or enabling the assistant from them', async () => {
    const persisted = new Map<string, unknown>();
    vi.mocked(unstable_cache).mockImplementation((read, keyParts) => {
      return (async (...args: Parameters<typeof read>) => {
        const key = JSON.stringify([keyParts, args]);
        if (persisted.has(key)) return persisted.get(key);
        const value = await read(...args);
        persisted.set(key, value);
        return value;
      }) as typeof read;
    });
    vi.mocked(fetch).mockRejectedValue(new DOMException('timed out', 'AbortError'));
    await expect(getStorefrontSettings()).resolves.toMatchObject({ phoneEnabled: true });
    await expect(getRequiredStorefrontSettings()).rejects.toMatchObject({ code: 'unavailable' });

    const restored = {
      phoneDisplay: '0555 11 22 33',
      phoneHref: 'tel:+213555112233',
      phoneEnabled: true,
      aiAssistantEnabled: false,
    };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(restored)));
    await expect(getStorefrontSettings()).resolves.toMatchObject(restored);
    await expect(getRequiredStorefrontSettings()).resolves.toMatchObject(restored);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('records authenticated assistant outcomes without customer conversation content', async () => {
    vi.stubEnv('STOREFRONT_META_PROXY_SECRET', 'test-proxy-secret');
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 202 }));

    await recordStorefrontAssistantRun({
      telemetry: {
        journeyId: 'journey-1',
        sessionId: 'session-1',
        pagePath: '/fr/products',
      },
      locale: 'fr',
      status: 'completed',
      model: 'storefront-model-id',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      durationMs: 420,
      toolCalls: 1,
      toolNames: ['search_catalog'],
      resultsCount: 2,
      cartChanges: 0,
      promptVersion: 'storefront-shopping-v2',
    });

    const [url, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:3001/storefront/analytics');
    expect(new Headers(options?.headers).get('x-storefront-meta-proxy-secret')).toBe(
      'test-proxy-secret',
    );
    const payload = JSON.parse(String(options?.body));
    expect(payload).toMatchObject({
      eventName: 'ai_assistant_run',
      journeyId: 'journey-1',
      sessionId: 'session-1',
      metadata: {
        storefrontProject: 'storefront',
        model: 'storefront-model-id',
        totalTokens: 15,
        durationMs: 420,
        toolCalls: 1,
        toolNames: ['search_catalog'],
        promptVersion: 'storefront-shopping-v2',
      },
    });
    expect(JSON.stringify(payload)).not.toContain('Find a drill');
    expect(JSON.stringify(payload)).not.toContain('These drills');
  });
});
