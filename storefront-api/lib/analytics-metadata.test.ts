import { describe, expect, it } from 'vitest';

import { buildStoredAnalyticsMetadata } from '@bric/storefront-core/analytics';

describe('stored analytics metadata', () => {
  it('removes duplicated request data while preserving reporting attribution', () => {
    const metadata = buildStoredAnalyticsMetadata({
      eventId: 'evt-1',
      journeyId: 'journey-1',
      sessionId: 'session-1',
      eventName: 'page_view',
      currency: 'DZD',
      metadata: {
        landingUrl: 'https://bricomaitre.com/?fbclid=secret',
        landingHost: 'bricomaitre.com',
        userAgent: 'large user agent',
        fbc: 'large-click-cookie',
        paidClickSeenAt: '2026-07-19T00:00:00Z',
        paidClickCookie: true,
        title: 'Page title',
        storefrontVariant: 'new',
        requestedVariant: 'fast_checkout',
        experimentMode: 'winner_rollout',
        experimentSource: 'storefront_default',
        metaTracking: {
          eventName: 'PageView',
          eventId: 'evt-1',
          pixel: { invoked: true, payload: { large: 'payload' } },
          capi: { queued: true, status: 202, payload: { large: 'payload' } },
        },
      },
    } as never);

    expect(metadata).toMatchObject({
      storefrontVariant: 'new',
      requestedVariant: 'fast_checkout',
      experimentMode: 'winner_rollout',
      experimentSource: 'storefront_default',
      metaTracking: {
        eventName: 'PageView',
        pixel: { invoked: true },
        capi: { queued: true, status: 202 },
      },
    });
    expect(metadata).not.toHaveProperty('landingUrl');
    expect(metadata).not.toHaveProperty('userAgent');
    expect(metadata).not.toHaveProperty('fbc');
    expect(metadata).not.toHaveProperty('title');
    expect(JSON.stringify(metadata)).not.toContain('payload');
  });
});
