import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildOrderAcquisitionSnapshot,
  buildOrderAiInfluenceSnapshot,
  buildGoogleMeasurementPayload,
  buildTikTokEventsPayload,
  isMarketingDestinationConfigured,
  sendMarketingDestinationEvent,
} from '@bric/storefront-core/marketing';

const line = {
  productId: 12,
  contentId: '12',
  rawValue: '12',
  title: 'Perceuse',
  originalUnitPrice: 4500,
  effectiveUnitPrice: 4000,
  unitPurchasePrice: 3000,
  quantity: 2,
  discountAmount: 1000,
  lineTotal: 8000,
  thumbnailUrl: null,
};

describe('multi-destination marketing domain', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID;
    delete process.env.GOOGLE_ANALYTICS_API_SECRET;
    delete process.env.TIKTOK_PIXEL_ID;
    delete process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN;
  });

  it('maps stable Meta campaign dimensions without retaining click identifiers', () => {
    const snapshot = buildOrderAcquisitionSnapshot({
      semanticsVersion: 'multi_destination_v1',
      eventId: 'purchase-1',
      eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
      acquisition: {
        landingPath: '/fr/products/perceuse',
        utmSource: 'Facebook',
        utmMedium: 'Paid_Social',
        utmCampaign: '120012345678901',
        utmTerm: '120012345678902',
        utmContent: '120012345678903',
        capturedAt: '2026-08-16T10:00:00.000Z',
      },
      google: {},
      tiktok: {},
    });

    expect(snapshot).toMatchObject({
      channel: 'meta_paid',
      evidence: 'paid_utm',
      attributionModel: 'last_non_direct_7d',
      landingPath: '/fr/products/perceuse',
      utmSource: 'facebook',
      utmMedium: 'paid_social',
      metaCampaignId: '120012345678901',
      metaAdsetId: '120012345678902',
      metaAdId: '120012345678903',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/fbclid|fbc|clientIp/i);
  });

  it.each(['fb', 'ig', 'an', 'th'])('recognizes the production Meta source code %s', (source) => {
    const snapshot = buildOrderAcquisitionSnapshot({
      semanticsVersion: 'multi_destination_v1',
      eventId: `purchase-${source}`,
      eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
      acquisition: {
        landingPath: '/fr',
        utmSource: source,
        utmMedium: 'paid_social',
        utmCampaign: '120012345678901',
        utmTerm: '120012345678902',
        utmContent: '120012345678903',
        capturedAt: '2026-08-16T10:00:00.000Z',
      },
    });

    expect(snapshot).toMatchObject({ channel: 'meta_paid', metaAdId: '120012345678903' });
  });

  it('uses a trusted Meta click only when no newer campaign source exists', () => {
    const base = {
      semanticsVersion: 'multi_destination_v1' as const,
      eventId: 'purchase-source-less',
      eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
      acquisition: {
        landingPath: '/fr',
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmTerm: '120012345678902',
        utmContent: '120012345678903',
        capturedAt: '2026-08-16T10:00:00.000Z',
      },
    };

    expect(buildOrderAcquisitionSnapshot(base, { hasMetaClick: true })).toMatchObject({
      channel: 'meta_unclassified',
      metaCampaignId: null,
      metaAdsetId: null,
      metaAdId: null,
    });
    expect(
      buildOrderAcquisitionSnapshot(
        {
          ...base,
          acquisition: { ...base.acquisition, utmSource: 'perplexity' },
        },
        { hasMetaClick: true },
      ),
    ).toMatchObject({ channel: 'external_ai', metaAdId: null });
  });

  it('prefers a platform click identifier over an older source-less Meta cookie', () => {
    const snapshot = buildOrderAcquisitionSnapshot(
      {
        semanticsVersion: 'multi_destination_v1',
        eventId: 'purchase-google',
        eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
        acquisition: {
          landingPath: '/fr',
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          utmTerm: null,
          utmContent: null,
          capturedAt: '2026-08-16T10:00:00.000Z',
        },
        google: { gclid: 'google-click' },
      },
      { hasMetaClick: true },
    );

    expect(snapshot).toMatchObject({ channel: 'google_paid', metaAdId: null });
  });

  it('keeps session entry and seven-day last-non-direct attribution as separate facts', () => {
    const snapshot = buildOrderAcquisitionSnapshot(
      {
        semanticsVersion: 'multi_destination_v1',
        eventId: 'purchase-direct-return',
        eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
        sessionEntry: {
          sessionId: 'session-direct',
          journeyId: 'journey-1',
          landingPath: '/fr/checkout',
          referrer: null,
          hasMetaClickId: false,
          hasGoogleClickId: false,
          hasTikTokClickId: false,
          capturedAt: '2026-08-17T10:00:00.000Z',
        },
        lastNonDirectTouch: {
          sessionId: 'session-google',
          journeyId: 'journey-1',
          landingPath: '/fr/products/perceuse',
          referrer: 'https://www.google.com/',
          hasMetaClickId: false,
          hasGoogleClickId: false,
          hasTikTokClickId: false,
          capturedAt: '2026-08-16T10:00:00.000Z',
        },
      },
      { now: new Date('2026-08-17T10:05:00.000Z') },
    );

    expect(snapshot).toMatchObject({
      channel: 'google_organic',
      evidence: 'google_referrer',
      sessionChannel: 'direct_dark_social',
      sessionEvidence: 'no_external_referrer',
      sourceSessionId: 'session-google',
    });
  });

  it('derives durable assistant influence from order evidence without conversation data', () => {
    const snapshot = buildOrderAiInfluenceSnapshot({
      marketing: {
        semanticsVersion: 'multi_destination_v1',
        eventId: 'purchase-ai',
        eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
        assistant: {
          sourceSessionId: 'session-1',
          journeyId: 'journey-1',
          openedAt: '2026-08-17T09:50:00.000Z',
          engagedAt: '2026-08-17T09:52:00.000Z',
          recommendationClickedAt: '2026-08-17T09:55:00.000Z',
          clickedProductIds: [12, 99],
          capturedAt: '2026-08-17T09:55:00.000Z',
        },
      },
      orderSessionId: 'session-1',
      lines: [line],
      now: new Date('2026-08-17T10:00:00.000Z'),
    });

    expect(snapshot).toMatchObject({
      level: 'recommended_product_ordered',
      sameSession: true,
      recommendedProductOrdered: true,
      clickedProductIds: [12, 99],
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/message|prompt|content/i);
  });

  it('builds GA4 Measurement Protocol ecommerce from server-authoritative lines', () => {
    expect(
      buildGoogleMeasurementPayload({
        eventName: 'purchase',
        eventId: 'purchase-1',
        orderId: 91,
        eventTime: new Date('2026-07-16T10:00:00.000Z'),
        clientId: '123.456',
        sessionId: '1712345',
        lines: [line],
      }),
    ).toMatchObject({
      client_id: '123.456',
      events: [
        {
          name: 'purchase',
          params: { event_id: 'purchase-1', transaction_id: '91', value: 8000, currency: 'DZD' },
        },
      ],
    });
  });

  it('hashes matching fields in TikTok Events API payloads and never stores raw customer PII', () => {
    const result = buildTikTokEventsPayload({
      eventName: 'CompletePayment',
      eventId: 'purchase-1',
      orderId: 91,
      eventTime: new Date('2026-07-16T10:00:00.000Z'),
      eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
      email: 'CLIENT@example.com',
      phone: '0550123456',
      externalId: 'journey-1',
      lines: [line],
    });
    const serialized = JSON.stringify(result);
    expect(result).toMatchObject({
      event_source: 'web',
      data: [
        {
          event: 'CompletePayment',
          event_id: 'purchase-1',
          context: { user: { email: [expect.any(String)], phone_number: [expect.any(String)] } },
        },
      ],
    });
    expect(serialized).not.toContain('CLIENT@example.com');
    expect(serialized).not.toContain('0550123456');
  });

  it('accepts Google independently when TikTok is unavailable', async () => {
    process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID = 'G-TEST';
    process.env.GOOGLE_ANALYTICS_API_SECRET = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const result = await sendMarketingDestinationEvent({
      destination: 'google',
      payload: { client_id: '123.456', events: [] },
    } as never);
    expect(result).toMatchObject({ ok: true, status: 204 });
  });

  it('does not queue optional destinations whose complete credentials are absent', () => {
    expect(
      isMarketingDestinationConfigured('google', {
        GOOGLE_ANALYTICS_MEASUREMENT_ID: 'G-TEST',
        GOOGLE_ANALYTICS_API_SECRET: 'secret',
      }),
    ).toBe(true);
    expect(
      isMarketingDestinationConfigured('tiktok', {
        TIKTOK_PIXEL_ID: 'pixel',
      }),
    ).toBe(false);
  });

  it('classifies missing destination credentials as a terminal configuration error', async () => {
    const result = await sendMarketingDestinationEvent({
      destination: 'tiktok',
      payload: {},
    } as never);

    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      status: null,
      code: 'destination_unconfigured',
    });
    expect(result).toHaveProperty('message', 'TikTok Events API credentials are not configured.');
  });

  it('marks retryable TikTok outages without throwing into order flow', async () => {
    process.env.TIKTOK_PIXEL_ID = 'pixel';
    process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN = 'token';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"code":500,"message":"busy"}', {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const result = await sendMarketingDestinationEvent({
      destination: 'tiktok',
      payload: {},
    } as never);
    expect(result).toMatchObject({ ok: false, retryable: true, status: 503 });
  });
});
