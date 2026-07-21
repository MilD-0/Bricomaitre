import { describe, expect, it } from 'vitest';

import { storefrontAnalyticsEventSchema } from '@bric/storefront-core/analytics';

const baseEvent = {
  eventId: 'event-1',
  journeyId: 'journey-1',
  sessionId: 'session-1',
  occurredAt: '2026-07-13T10:00:00.000Z',
  locale: 'fr',
};

describe('storefront analytics v1 contract', () => {
  it('accepts versioned Product Detail events and Web Vitals', () => {
    expect(storefrontAnalyticsEventSchema.parse({
      ...baseEvent,
      eventVersion: 1,
      eventName: 'view_item',
      productId: 12,
      productSlug: 'desk-lamp',
      metadata: { storefrontProject: 'storefront-new' },
    })).toMatchObject({ eventVersion: 1, eventName: 'view_item', productId: 12 });

    expect(storefrontAnalyticsEventSchema.safeParse({
      ...baseEvent,
      eventVersion: 1,
      eventName: 'web_vital',
      metadata: { metricName: 'LCP', metricValue: 1800 },
    }).success).toBe(true);

    expect(storefrontAnalyticsEventSchema.safeParse({
      ...baseEvent,
      eventVersion: 1,
      eventName: 'view_item_media',
      productId: 12,
      metadata: { mediaAction: 'open', mediaIndex: 0, mediaCount: 2 },
    }).success).toBe(true);
  });

  it('rejects unknown contract versions while retaining legacy unversioned producers', () => {
    expect(storefrontAnalyticsEventSchema.safeParse({
      ...baseEvent,
      eventVersion: 2,
      eventName: 'view_item',
    }).success).toBe(false);
    expect(storefrontAnalyticsEventSchema.safeParse({
      ...baseEvent,
      eventName: 'view_item',
    }).success).toBe(true);
  });

  it('accepts governed catalog impression events', () => {
    expect(storefrontAnalyticsEventSchema.parse({
      ...baseEvent,
      eventVersion: 1,
      eventName: 'view_item_list',
      pageType: 'catalog',
      pagePath: '/fr/products',
      metadata: { resultsCount: 2, page: 1, visibleProductIds: [12, 13] },
    })).toMatchObject({ eventName: 'view_item_list', pageType: 'catalog' });
  });

  it('accepts privacy-safe commerce lines for checkout and purchase attribution', () => {
    const parsed = storefrontAnalyticsEventSchema.parse({
      ...baseEvent,
      eventVersion: 1,
      eventName: 'begin_checkout',
      quantity: 3,
      value: 8000,
      metadata: {
        cartMode: 'cart',
        itemCount: 3,
        items: [
          { productId: 12, productSlug: 'perceuse', quantity: 2, price: 2250 },
          { productId: 34, productSlug: 'meuleuse', quantity: 1, price: 3500 },
        ],
      },
    });

    expect(parsed.metadata.items).toEqual([
      { productId: 12, productSlug: 'perceuse', quantity: 2, price: 2250 },
      { productId: 34, productSlug: 'meuleuse', quantity: 1, price: 3500 },
    ]);
  });

  it.each(['navigation_click', 'navigation_menu_open', 'locale_change'] as const)(
    'accepts the governed global navigation event %s',
    (eventName) => {
      expect(storefrontAnalyticsEventSchema.safeParse({
        ...baseEvent,
        eventVersion: 1,
        eventName,
        pageType: 'global_navigation',
        metadata: { surface: 'header', target: 'products' },
      }).success).toBe(true);
    },
  );

  it('accepts privacy-safe storefront assistant telemetry', () => {
    expect(storefrontAnalyticsEventSchema.parse({
      ...baseEvent,
      eventVersion: 1,
      eventName: 'ai_assistant_run',
      pageType: 'ai_assistant',
      pagePath: '/fr/products',
      metadata: {
        storefrontProject: 'storefront-new',
        intent: 'product_search',
        status: 'completed',
        mode: 'ai',
        model: 'storefront-model-id',
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        durationMs: 450,
        toolCalls: 1,
        resultsCount: 2,
      },
    })).toMatchObject({ eventName: 'ai_assistant_run', searchTerm: null });
  });
});
