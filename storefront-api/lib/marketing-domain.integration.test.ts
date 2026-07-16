import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildGoogleMeasurementPayload,
  buildTikTokEventsPayload,
  sendMarketingDestinationEvent,
} from '@bric/storefront-core/marketing';

const line = {
  productId: 12,
  contentId: '12',
  rawValue: '12',
  title: 'Perceuse',
  originalUnitPrice: 4500,
  effectiveUnitPrice: 4000,
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

  it('builds GA4 Measurement Protocol ecommerce from server-authoritative lines', () => {
    expect(buildGoogleMeasurementPayload({
      eventName: 'purchase', eventId: 'purchase-1', orderId: 91,
      eventTime: new Date('2026-07-16T10:00:00.000Z'), clientId: '123.456', sessionId: '1712345', lines: [line],
    })).toMatchObject({
      client_id: '123.456',
      events: [{ name: 'purchase', params: { event_id: 'purchase-1', transaction_id: '91', value: 8000, currency: 'DZD' } }],
    });
  });

  it('hashes matching fields in TikTok Events API payloads and never stores raw customer PII', () => {
    const result = buildTikTokEventsPayload({
      eventName: 'CompletePayment', eventId: 'purchase-1', orderId: 91,
      eventTime: new Date('2026-07-16T10:00:00.000Z'), eventSourceUrl: 'https://bricomaitre.com/fr/checkout',
      email: 'CLIENT@example.com', phone: '0550123456', externalId: 'journey-1', lines: [line],
    });
    const serialized = JSON.stringify(result);
    expect(result).toMatchObject({
      event_source: 'web',
      data: [{
        event: 'CompletePayment',
        event_id: 'purchase-1',
        context: { user: { email: [expect.any(String)], phone_number: [expect.any(String)] } },
      }],
    });
    expect(serialized).not.toContain('CLIENT@example.com');
    expect(serialized).not.toContain('0550123456');
  });

  it('accepts Google independently when TikTok is unavailable', async () => {
    process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID = 'G-TEST';
    process.env.GOOGLE_ANALYTICS_API_SECRET = 'secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const result = await sendMarketingDestinationEvent({
      destination: 'google', payload: { client_id: '123.456', events: [] },
    } as never);
    expect(result).toMatchObject({ ok: true, status: 204 });
  });

  it('marks retryable TikTok outages without throwing into order flow', async () => {
    process.env.TIKTOK_PIXEL_ID = 'pixel';
    process.env.TIKTOK_EVENTS_API_ACCESS_TOKEN = 'token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":500,"message":"busy"}', { status: 503, headers: { 'content-type': 'application/json' } })));
    const result = await sendMarketingDestinationEvent({ destination: 'tiktok', payload: {} } as never);
    expect(result).toMatchObject({ ok: false, retryable: true, status: 503 });
  });
});
