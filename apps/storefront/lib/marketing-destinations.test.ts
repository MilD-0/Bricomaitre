import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorefrontAnalyticsPayload } from './analytics';
let destinations: typeof import('./marketing-destinations');

function payload(overrides: Partial<StorefrontAnalyticsPayload> = {}): StorefrontAnalyticsPayload {
  return {
    eventVersion: 1,
    eventId: 'event-1',
    visitId: 'visit-1',
    journeyId: 'journey-1',
    sessionId: 'session-1',
    eventName: 'view_item',
    occurredAt: '2026-07-16T10:00:00.000Z',
    pagePath: '/fr/products/perceuse',
    pageType: 'product_detail',
    locale: 'fr',
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    productId: 12,
    productSlug: 'perceuse',
    categoryId: 3,
    categorySlug: null,
    brandId: 4,
    brandSlug: null,
    searchTerm: null,
    quantity: 2,
    value: 4500,
    orderId: null,
    currency: 'DZD',
    metadata: {
      storefrontProject: 'storefront',
      viewportClass: 'desktop',
      effectiveConnectionType: null,
      saveData: false,
      release: null,
      landingUrl: '',
      landingHost: '',
      fbc: null,
      paidClickCookie: false,
      sessionStartedAt: '2026-07-16T10:00:00.000Z',
      acquisitionChannel: 'direct_dark_social',
      acquisitionEvidence: 'no_external_referrer',
      hasMetaClickId: false,
      hasGoogleClickId: false,
      hasTikTokClickId: false,
    },
    ...overrides,
  };
}

describe('client destination mappings', () => {
  beforeEach(async () => {
    vi.resetModules();
    destinations = await import('./marketing-destinations');
    delete window.fbq;
    delete window._fbq;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('prepares only the Meta queue without injecting vendor scripts', () => {
    vi.stubEnv('NEXT_PUBLIC_TIKTOK_PIXEL_ID', 'tt-id');
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST');
    destinations.prepareMarketingDestinations({ metaPixelId: 'meta-id' });
    expect(window.fbq).toBeTypeOf('function');
    expect('gtag' in window).toBe(false);
    expect('dataLayer' in window).toBe(false);
    expect('ttq' in window).toBe(false);
    expect(document.querySelectorAll('script[id^="bric-"]')).toHaveLength(0);
  });

  it('uses governed Meta names and commerce parameters', () => {
    expect(destinations.mapMetaEvent(payload())).toMatchObject({
      name: 'ViewContent',
      params: { content_ids: ['12'] },
    });
    expect(destinations.mapMetaEvent(payload())).toMatchObject({
      params: { value: 4500, contents: [{ id: '12', quantity: 2, item_price: 2250 }] },
    });
  });

  it('maps a verified purchase with transaction identity and no customer PII', () => {
    const purchase = payload({
      eventName: 'purchase',
      orderId: 91,
      productId: null,
      metadata: {
        storefrontProject: 'storefront',
        viewportClass: 'desktop',
        effectiveConnectionType: null,
        saveData: false,
        release: null,
        cartMode: 'cart',
        itemCount: 3,
        landingUrl: '',
        landingHost: '',
        fbc: null,
        paidClickCookie: false,
        sessionStartedAt: '2026-07-16T10:00:00.000Z',
        acquisitionChannel: 'direct_dark_social',
        acquisitionEvidence: 'no_external_referrer',
        hasMetaClickId: false,
        hasGoogleClickId: false,
        hasTikTokClickId: false,
        items: [
          { productId: 12, productSlug: 'perceuse', quantity: 2, price: 2250 },
          { productId: 34, productSlug: 'meuleuse', quantity: 1, price: 3500 },
        ],
      },
    });
    const mapped = destinations.mapMetaEvent(purchase);
    expect(mapped).toMatchObject({
      name: 'Purchase',
      params: {
        value: 8000,
        content_ids: ['12', '34'],
        contents: [
          { id: '12', quantity: 2, item_price: 2250 },
          { id: '34', quantity: 1, item_price: 3500 },
        ],
      },
    });
    expect(JSON.stringify(mapped)).not.toMatch(/phone|email|address/i);
    expect(destinations.buildMetaServerEvent(purchase)).toBeNull();
  });

  it('maps every checkout line to Pixel and server CAPI using numeric catalog ids', () => {
    const checkout = payload({
      eventName: 'begin_checkout',
      productId: null,
      quantity: 3,
      value: 8900,
      metadata: {
        storefrontProject: 'storefront',
        viewportClass: 'desktop',
        effectiveConnectionType: null,
        saveData: false,
        release: null,
        cartMode: 'cart',
        itemCount: 3,
        landingUrl: '',
        landingHost: '',
        fbc: null,
        paidClickCookie: false,
        sessionStartedAt: '2026-07-16T10:00:00.000Z',
        acquisitionChannel: 'direct_dark_social',
        acquisitionEvidence: 'no_external_referrer',
        hasMetaClickId: false,
        hasGoogleClickId: false,
        hasTikTokClickId: false,
        items: [
          { productId: 12, productSlug: 'perceuse', quantity: 2, price: 2250 },
          { productId: 34, productSlug: 'meuleuse', quantity: 1, price: 3500 },
        ],
      },
    });

    expect(destinations.mapMetaEvent(checkout)).toMatchObject({
      name: 'InitiateCheckout',
      params: { content_ids: ['12', '34'], value: 8000 },
    });
    expect(destinations.buildMetaServerEvent(checkout)).toMatchObject({
      eventName: 'InitiateCheckout',
      items: [
        { productId: 12, quantity: 2 },
        { productId: 34, quantity: 1 },
      ],
    });
  });

  it('retries failed initialization and only deduplicates successful event invocations', () => {
    vi.stubEnv('NEXT_PUBLIC_FACEBOOK_PIXEL_ID', 'meta-id');
    const pixel = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('blocked initialization');
      })
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new Error('blocked tracking');
      })
      .mockImplementation(() => undefined);
    window.fbq = pixel;
    expect(destinations.deliverClientMarketingEvent(payload()).meta.invoked).toBe(false);
    expect(pixel.mock.calls.map((call) => call[0])).toEqual(['init']);
    expect(destinations.deliverClientMarketingEvent(payload()).meta.invoked).toBe(false);
    expect(destinations.deliverClientMarketingEvent(payload()).meta.invoked).toBe(true);
    expect(destinations.deliverClientMarketingEvent(payload()).meta.invoked).toBe(true);
    expect(pixel.mock.calls.map((call) => call[0])).toEqual(['init', 'init', 'track', 'track']);
  });

  it('builds an allowlisted Meta server event for non-purchase interactions', () => {
    expect(destinations.buildMetaServerEvent(payload())).toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        eventName: 'ViewContent',
        items: [{ productId: 12, quantity: 2 }],
      }),
    );
  });
});
