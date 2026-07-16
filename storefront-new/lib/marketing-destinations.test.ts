import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorefrontAnalyticsPayload } from './analytics';
import {
  buildMetaServerEvent,
  deliverClientMarketingEvent,
  loadMarketingDestinationScripts,
  mapGoogleEvent,
  mapMetaEvent,
  mapTikTokEvent,
  prepareMarketingDestinations,
} from './marketing-destinations';

function payload(overrides: Partial<StorefrontAnalyticsPayload> = {}): StorefrontAnalyticsPayload {
  return {
    eventVersion: 1,
    eventId: 'event-1',
    journeyId: 'journey-1',
    sessionId: 'session-1',
    eventName: 'view_item',
    occurredAt: '2026-07-16T10:00:00.000Z',
    pagePath: '/fr/products/perceuse',
    pageType: 'product_detail',
    locale: 'fr',
    referrer: null,
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
    metadata: { storefrontProject: 'storefront-new', viewportClass: 'desktop', effectiveConnectionType: null, saveData: false, release: null },
    ...overrides,
  };
}

describe('client destination mappings', () => {
  beforeEach(() => {
    delete window.fbq;
    delete window.gtag;
    delete window.ttq;
  });

  it('prepares vendor queues immediately but defers all remote scripts', () => {
    vi.stubEnv('NEXT_PUBLIC_FACEBOOK_PIXEL_ID', 'meta-id');
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST');
    vi.stubEnv('NEXT_PUBLIC_TIKTOK_PIXEL_ID', 'tt-id');
    prepareMarketingDestinations();
    expect(window.fbq).toBeTypeOf('function');
    expect(window.gtag).toBeTypeOf('function');
    expect(window.ttq?.track).toBeTypeOf('function');
    expect(document.querySelectorAll('script[id^="bric-"]')).toHaveLength(0);
    loadMarketingDestinationScripts();
    expect(document.querySelectorAll('script[id^="bric-"]')).toHaveLength(3);
  });

  it('uses governed vendor names and a shared event identifier', () => {
    expect(mapGoogleEvent(payload())).toMatchObject({ name: 'view_item', params: { event_id: 'event-1', currency: 'DZD' } });
    expect(mapMetaEvent(payload())).toMatchObject({ name: 'ViewContent', params: { content_ids: ['12'] } });
    expect(mapTikTokEvent(payload())).toMatchObject({ name: 'ViewContent', properties: { content_id: '12' } });
  });

  it('maps a verified purchase with transaction identity and no customer PII', () => {
    const purchase = payload({ eventName: 'purchase', orderId: 91 });
    const mapped = [mapGoogleEvent(purchase), mapMetaEvent(purchase), mapTikTokEvent(purchase)];
    expect(mapped[0]).toMatchObject({ params: { transaction_id: '91' } });
    expect(JSON.stringify(mapped)).not.toMatch(/phone|email|address/i);
    expect(buildMetaServerEvent(purchase)).toBeNull();
  });

  it('keeps throwing or blocked vendor globals non-blocking', () => {
    window.fbq = vi.fn(() => { throw new Error('blocked'); });
    expect(() => deliverClientMarketingEvent(payload())).not.toThrow();
  });

  it('builds an allowlisted Meta server event for non-purchase interactions', () => {
    expect(buildMetaServerEvent(payload())).toEqual(expect.objectContaining({
      eventId: 'event-1',
      eventName: 'ViewContent',
      items: [{ productId: 12, quantity: 2 }],
    }));
  });
});
