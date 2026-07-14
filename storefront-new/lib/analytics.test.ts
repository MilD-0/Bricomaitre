import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCheckoutAnalyticsPayload,
  buildCatalogAnalyticsPayload,
  buildProductAnalyticsPayload,
  buildNavigationAnalyticsPayload,
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
    vi.unstubAllGlobals();
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
      metadata: { storefrontProject: 'storefront-new' },
    });
    expect(payload.eventId).toBeTruthy();
    expect(payload.journeyId).toBeTruthy();
    expect(payload.sessionId).toBeTruthy();
    expect(JSON.stringify(payload)).not.toMatch(/phone|address|email|access.?token/i);
  });

  it('rejects ungoverned metadata fields before collection', () => {
    expect(() => buildProductAnalyticsPayload({
      eventName: 'view_item',
      locale: 'fr',
      metadata: { phone: '0550000000' } as never,
    })).toThrow();
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
    expect(sanitizeAnalyticsReferrer(
      'https://bricomaitre.com/fr/products?email=private@example.com',
      'https://bricomaitre.com',
    )).toBe('https://bricomaitre.com/fr/products');
    expect(sanitizeAnalyticsReferrer(
      'https://search.example/results/private-query?q=secret',
      'https://bricomaitre.com',
    )).toBe('https://search.example');
  });

  it('keeps collection failures non-blocking', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('collector unavailable')));

    await expect(trackProductEvent({
      eventName: 'buy_now_click',
      locale: 'fr',
      productId: 12,
      productSlug: 'desk-lamp',
    })).resolves.toMatchObject({ eventName: 'buy_now_click' });
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
        sort: 'newest',
        visibleProductIds: [12, 13],
      },
    });

    expect(payload).toMatchObject({
      eventName: 'view_item_list',
      pageType: 'catalog',
      searchTerm: 'perceuse',
      metadata: { resultsCount: 2, visibleProductIds: [12, 13] },
    });
  });

  it('rejects ungoverned catalog metadata and oversized searches', () => {
    expect(() => buildCatalogAnalyticsPayload({
      eventName: 'search',
      locale: 'fr',
      searchTerm: 'x'.repeat(81),
      metadata: { phone: '0550000000' } as never,
    })).toThrow();
  });

  it('builds privacy-limited global navigation events', () => {
    expect(buildNavigationAnalyticsPayload({
      eventName: 'navigation_click',
      locale: 'fr',
      metadata: { surface: 'header', target: 'products' },
    })).toMatchObject({
      eventName: 'navigation_click',
      pageType: 'global_navigation',
      metadata: { surface: 'header', target: 'products' },
    });

    expect(() => buildNavigationAnalyticsPayload({
      eventName: 'navigation_click',
      locale: 'fr',
      metadata: { surface: 'header', target: 'products', phone: '0550000000' } as never,
    })).toThrow();

    expect(buildNavigationAnalyticsPayload({
      eventName: 'remove_from_cart',
      locale: 'fr',
      productId: 12,
      productSlug: 'desk-lamp',
      quantity: 2,
      value: 9000,
      metadata: { surface: 'cart_drawer', target: 'remove' },
    })).toMatchObject({
      eventName: 'remove_from_cart',
      quantity: 2,
      value: 9000,
      metadata: { surface: 'cart_drawer', target: 'remove' },
    });
  });

  it('tracks checkout outcomes without accepting customer PII', () => {
    expect(buildCheckoutAnalyticsPayload({
      eventName: 'order_create_success',
      locale: 'fr',
      orderId: 91,
      quantity: 2,
      value: 9600,
      metadata: { cartMode: 'cart', itemCount: 2, delivery: 'home' },
    })).toMatchObject({
      eventName: 'order_create_success',
      pageType: 'checkout',
      orderId: 91,
      value: 9600,
    });

    expect(() => buildCheckoutAnalyticsPayload({
      eventName: 'checkout_submit_attempt',
      locale: 'fr',
      metadata: { cartMode: 'cart', itemCount: 2, phone: '0550000000' } as never,
    })).toThrow();
  });
});
