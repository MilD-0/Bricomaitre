import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorefrontAnalyticsPayload } from './analytics';
import {
  buildMetaServerEvent,
  deliverClientMarketingEvent,
  mapGoogleEvent,
  mapMetaEvent,
  prepareMarketingDestinations,
} from './marketing-destinations';

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
  beforeEach(() => {
    delete window.fbq;
    delete window.gtag;
  });

  it('prepares Meta and GA queues without injecting vendor scripts or TikTok', () => {
    vi.stubEnv('NEXT_PUBLIC_TIKTOK_PIXEL_ID', 'tt-id');
    prepareMarketingDestinations({ metaPixelId: 'meta-id', googleMeasurementId: 'G-TEST' });
    expect(window.fbq).toBeTypeOf('function');
    expect(window.gtag).toBeTypeOf('function');
    expect('ttq' in window).toBe(false);
    expect(document.querySelectorAll('script[id^="bric-"]')).toHaveLength(0);
  });

  it('uses governed vendor names and a shared event identifier', () => {
    expect(mapGoogleEvent(payload())).toMatchObject({
      name: 'view_item',
      params: { event_id: 'event-1', currency: 'DZD' },
    });
    expect(mapMetaEvent(payload())).toMatchObject({
      name: 'ViewContent',
      params: { content_ids: ['12'] },
    });
    expect(mapMetaEvent(payload())).toMatchObject({
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
    const mapped = [mapGoogleEvent(purchase), mapMetaEvent(purchase)];
    expect(mapped[0]).toMatchObject({ params: { transaction_id: '91' } });
    expect(mapped[1]).toMatchObject({
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
    expect(buildMetaServerEvent(purchase)).toBeNull();
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

    expect(mapMetaEvent(checkout)).toMatchObject({
      name: 'InitiateCheckout',
      params: { content_ids: ['12', '34'], value: 8000 },
    });
    expect(buildMetaServerEvent(checkout)).toMatchObject({
      eventName: 'InitiateCheckout',
      items: [
        { productId: 12, quantity: 2 },
        { productId: 34, quantity: 1 },
      ],
    });
  });

  it('keeps throwing or blocked vendor globals non-blocking', () => {
    window.fbq = vi.fn(() => {
      throw new Error('blocked');
    });
    expect(deliverClientMarketingEvent(payload()).meta.invoked).toBe(false);
  });

  it('builds an allowlisted Meta server event for non-purchase interactions', () => {
    expect(buildMetaServerEvent(payload())).toEqual(
      expect.objectContaining({
        eventId: 'event-1',
        eventName: 'ViewContent',
        items: [{ productId: 12, quantity: 2 }],
      }),
    );
  });
});
