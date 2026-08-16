import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCheckoutAnalyticsPayload,
  buildCatalogAnalyticsPayload,
  buildProductAnalyticsPayload,
  buildNavigationAnalyticsPayload,
  buildPageAnalyticsPayload,
  sanitizeAnalyticsReferrer,
  trackProductEvent,
} from './analytics';

describe('Product Detail analytics', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/fr/products/desk-lamp');
  });

  afterEach(() => {
    delete window.fbq;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('builds a versioned, correlated, privacy-limited product event', () => {
    const payload = buildProductAnalyticsPayload({
      eventName: 'view_item',
      locale: 'fr',
      productId: 12,
      productSlug: 'desk-lamp',
      value: 1500,
    });

    expect(payload).toMatchObject({
      eventVersion: 1,
      eventName: 'view_item',
      pageType: 'product_detail',
      pagePath: '/fr/products/desk-lamp',
      productId: 12,
      productSlug: 'desk-lamp',
      currency: 'DZD',
      metadata: { storefrontProject: 'storefront' },
    });
    expect(payload.eventId).toBeTruthy();
    expect(payload.journeyId).toBeTruthy();
    expect(payload.sessionId).toBeTruthy();
    expect(payload.visitId).toBeTruthy();
    expect(JSON.stringify(payload)).not.toMatch(/phone|address|email|access.?token/i);
  });

  it('carries allowlisted first-touch campaign attribution without arbitrary queries', () => {
    window.localStorage.clear();
    window.history.replaceState(
      {},
      '',
      '/fr/products/desk-lamp?fbclid=meta-1&utm_source=facebook&utm_medium=paid_social&phone=0550000000',
    );
    const payload = buildProductAnalyticsPayload({
      eventName: 'view_item',
      locale: 'fr',
      productId: 12,
    });
    expect(payload).toMatchObject({
      visitId: expect.any(String),
      utmSource: 'facebook',
      utmMedium: 'paid_social',
      metadata: {
        landingUrl: expect.stringContaining('fbclid=meta-1'),
        paidClickCookie: true,
      },
    });
    expect(JSON.stringify(payload)).not.toContain('0550000000');
  });

  it('records whether the Meta Pixel queue was actually invoked', async () => {
    vi.stubEnv('NEXT_PUBLIC_FACEBOOK_PIXEL_ID', 'meta-id');
    window.fbq = vi.fn() as NonNullable<Window['fbq']>;
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }),
    );

    await trackProductEvent({ eventName: 'view_item', locale: 'fr', productId: 12 });

    const firstParty = requests.find((request) => request.url === '/api/analytics');
    expect(firstParty?.body).toMatchObject({
      metadata: { metaTracking: { eventName: 'ViewContent', pixel: { invoked: true } } },
    });
  });

  it('rejects ungoverned metadata fields before collection', () => {
    expect(() =>
      buildProductAnalyticsPayload({
        eventName: 'view_item',
        locale: 'fr',
        metadata: { phone: '0550000000' } as never,
      }),
    ).toThrow();
  });

  it('allows only governed product-media interaction metadata', () => {
    const payload = buildProductAnalyticsPayload({
      eventName: 'view_item_media',
      locale: 'ar',
      productId: 12,
      productSlug: 'desk-lamp',
      metadata: { mediaAction: 'navigate', mediaIndex: 1, mediaCount: 2 },
    });

    expect(payload).toMatchObject({
      eventName: 'view_item_media',
      metadata: { mediaAction: 'navigate', mediaIndex: 1, mediaCount: 2 },
    });
  });

  it('removes queries and external paths from analytics referrers', () => {
    expect(
      sanitizeAnalyticsReferrer(
        'https://bricomaitre.com/fr/products?email=private@example.com',
        'https://bricomaitre.com',
      ),
    ).toBe('https://bricomaitre.com/fr/products');
    expect(
      sanitizeAnalyticsReferrer(
        'https://search.example/results/private-query?q=secret',
        'https://bricomaitre.com',
      ),
    ).toBe('https://search.example');
  });

  it('keeps collection failures non-blocking', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('collector unavailable')));

    await expect(
      trackProductEvent({
        eventName: 'buy_now_click',
        locale: 'fr',
        productId: 12,
        productSlug: 'desk-lamp',
      }),
    ).resolves.toMatchObject({ eventName: 'buy_now_click' });
  });

  it('builds governed catalog impression and discovery events', () => {
    window.history.replaceState({}, '', '/fr/products?q=perceuse');
    const payload = buildCatalogAnalyticsPayload({
      eventName: 'view_item_list',
      locale: 'fr',
      searchTerm: 'perceuse',
      metadata: {
        resultsCount: 2,
        page: 1,
        sort: 'recommended',
        visibleProductIds: [12, 13],
      },
    });

    expect(payload).toMatchObject({
      eventName: 'view_item_list',
      pageType: 'catalog',
      searchTerm: 'perceuse',
      metadata: { resultsCount: 2, sort: 'recommended', visibleProductIds: [12, 13] },
    });
  });

  it('rejects ungoverned catalog metadata and oversized searches', () => {
    expect(() =>
      buildCatalogAnalyticsPayload({
        eventName: 'search',
        locale: 'fr',
        searchTerm: 'x'.repeat(81),
        metadata: { phone: '0550000000' } as never,
      }),
    ).toThrow();
  });

  it('builds privacy-limited global navigation events', () => {
    expect(
      buildNavigationAnalyticsPayload({
        eventName: 'navigation_click',
        locale: 'fr',
        metadata: { surface: 'header', target: 'products' },
      }),
    ).toMatchObject({
      eventName: 'navigation_click',
      pageType: 'global_navigation',
      metadata: { surface: 'header', target: 'products' },
    });

    expect(() =>
      buildNavigationAnalyticsPayload({
        eventName: 'navigation_click',
        locale: 'fr',
        metadata: { surface: 'header', target: 'products', phone: '0550000000' } as never,
      }),
    ).toThrow();

    expect(
      buildNavigationAnalyticsPayload({
        eventName: 'remove_from_cart',
        locale: 'fr',
        productId: 12,
        productSlug: 'desk-lamp',
        quantity: 2,
        value: 9000,
        metadata: { surface: 'cart_drawer', target: 'remove' },
      }),
    ).toMatchObject({
      eventName: 'remove_from_cart',
      quantity: 2,
      value: 9000,
      metadata: { surface: 'cart_drawer', target: 'remove' },
    });
  });

  it('governs assistant outcomes without accepting customer conversation text', () => {
    expect(
      buildNavigationAnalyticsPayload({
        eventName: 'ai_assistant_result_click',
        locale: 'ar',
        productId: 12,
        productSlug: 'perceuse-beton',
        metadata: { surface: 'ai_assistant', target: 'product_result', position: 1 },
      }),
    ).toMatchObject({
      eventName: 'ai_assistant_result_click',
      productId: 12,
      metadata: { surface: 'ai_assistant', target: 'product_result', position: 1 },
    });

    expect(() =>
      buildNavigationAnalyticsPayload({
        eventName: 'ai_assistant_message',
        locale: 'fr',
        searchTerm: 'private customer question',
        metadata: { surface: 'ai_assistant', target: 'submitted' },
      }),
    ).toThrow();
    const payload = buildNavigationAnalyticsPayload({
      eventName: 'ai_assistant_message',
      locale: 'fr',
      metadata: { surface: 'ai_assistant', target: 'submitted' },
    });
    expect(JSON.stringify(payload)).not.toContain('private customer question');
  });

  it('tracks checkout outcomes without accepting customer PII', () => {
    expect(
      buildCheckoutAnalyticsPayload({
        eventName: 'order_create_success',
        locale: 'fr',
        orderId: 91,
        quantity: 2,
        value: 9600,
        metadata: { cartMode: 'cart', itemCount: 2, delivery: 'home' },
      }),
    ).toMatchObject({
      eventName: 'order_create_success',
      pageType: 'checkout',
      orderId: 91,
      value: 9600,
    });

    expect(() =>
      buildCheckoutAnalyticsPayload({
        eventName: 'checkout_submit_attempt',
        locale: 'fr',
        metadata: { cartMode: 'cart', itemCount: 2, phone: '0550000000' } as never,
      }),
    ).toThrow();
  });

  it('builds a first-party page view and preserves an authoritative purchase id', () => {
    expect(buildPageAnalyticsPayload({ locale: 'fr', pageType: 'homepage' })).toMatchObject({
      eventName: 'page_view',
      pageType: 'homepage',
    });
    expect(
      buildCheckoutAnalyticsPayload(
        {
          eventId: 'purchase-91',
          eventName: 'purchase',
          locale: 'fr',
          orderId: 91,
          metadata: {
            cartMode: 'cart',
            itemCount: 3,
            items: [
              { productId: 12, productSlug: 'perceuse', quantity: 2, price: 2250 },
              { productId: 34, productSlug: 'meuleuse', quantity: 1, price: 3500 },
            ],
          },
        },
        'thank_you',
      ),
    ).toMatchObject({
      eventId: 'purchase-91',
      eventName: 'purchase',
      orderId: 91,
      metadata: { items: [{ productId: 12 }, { productId: 34 }] },
    });
  });
});
