import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildMetaCommerceCustomData,
  buildMetaUserData,
  resolveMetaOrderLocation,
  sendMetaEvent,
} from '@bric/storefront-core/meta';

describe('Meta domain rules', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.META_PIXEL_ID;
    delete process.env.META_CONVERSIONS_API_TOKEN;
    delete process.env.META_GRAPH_API_VERSION;
    delete process.env.META_GRAPH_API_ORIGIN;
  });

  it('resolves normalized wilaya and commune postal matching data', () => {
    expect(
      resolveMetaOrderLocation(
        {
          wilayas: [{ wilayaId: 16, name: 'Alger' }],
          communes: [{ communeId: 42, wilayaId: 16, name: 'Bâb Ezzouar', postalCode: ' 16042 ' }],
        },
        16,
        'bab ezzouar',
      ),
    ).toEqual({ stateName: 'Alger', postalCode: '16042' });

    const userData = buildMetaUserData({ state: 'Alger', postalCode: '16042' });
    expect(userData).toMatchObject({
      st: expect.stringMatching(/^[a-f0-9]{64}$/),
      zp: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('builds quantity-aware product-subtotal payloads without delivery', () => {
    const payload = buildMetaCommerceCustomData(
      [
        {
          productId: 12,
          contentId: '12',
          rawValue: '12',
          title: 'Drill',
          originalUnitPrice: 1000,
          effectiveUnitPrice: 800,
          unitPurchasePrice: 600,
          quantity: 2,
          discountAmount: 400,
          lineTotal: 1600,
          thumbnailUrl: null,
        },
      ],
      99,
    );
    expect(payload).toMatchObject({
      content_ids: ['12'],
      contents: [{ id: '12', quantity: 2, item_price: 800 }],
      num_items: 2,
      value: 1600,
      order_id: '99',
    });
  });

  it('hashes order PII while preserving valid browser match cookies', () => {
    const userData = buildMetaUserData({
      email: ' Person@Example.com ',
      phone: '0550 11 22 33',
      fbc: 'fb.1.1700000000.click',
      fbp: 'fb.1.1700000000.123',
    });
    expect(userData.em).toMatch(/^[a-f0-9]{64}$/);
    expect(userData.ph).toMatch(/^[a-f0-9]{64}$/);
    expect(userData.em).not.toContain('person');
    expect(userData.fbc).toBe('fb.1.1700000000.click');
    expect(userData.fbp).toBe('fb.1.1700000000.123');
  });

  it('treats events_received zero as a failed delivery', async () => {
    process.env.META_PIXEL_ID = 'pixel';
    process.env.META_CONVERSIONS_API_TOKEN = 'token';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            events_received: 0,
            fbtrace_id: 'trace',
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await sendMetaEvent({
      eventName: 'PageView',
      eventId: 'event-1',
      eventTime: new Date(),
      eventSourceUrl: 'https://bricomaitre.com/',
      userData: {},
      customData: {},
    });
    expect(result).toMatchObject({
      ok: false,
      retryable: false,
      status: 200,
    });
  });

  it('classifies throttling as retryable and sends Graph v25 by default', async () => {
    process.env.META_PIXEL_ID = 'pixel';
    process.env.META_CONVERSIONS_API_TOKEN = 'token';
    delete process.env.META_GRAPH_API_VERSION;
    delete process.env.META_GRAPH_API_ORIGIN;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: 'slow down', code: 4 },
        }),
        { status: 429, headers: { 'retry-after': '60' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMetaEvent({
      eventName: 'PageView',
      eventId: 'event-2',
      eventTime: new Date(),
      eventSourceUrl: 'https://bricomaitre.com/',
      userData: {},
      customData: {},
    });
    expect(result).toMatchObject({
      ok: false,
      retryable: true,
      retryAfterMs: 60_000,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.facebook.com/v25.0/pixel/events',
      expect.any(Object),
    );
  });

  it('uses an explicit internal Graph origin in an isolated deployment', async () => {
    process.env.META_PIXEL_ID = 'demo-pixel';
    process.env.META_CONVERSIONS_API_TOKEN = 'demo-token';
    process.env.META_GRAPH_API_ORIGIN = 'http://mock-services:8080/meta/';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'demo-trace' }), {
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMetaEvent({
      eventName: 'PageView',
      eventId: 'demo-event',
      eventTime: new Date(),
      eventSourceUrl: 'https://demo.bricomaitre.invalid/',
      userData: {},
      customData: {},
    });

    expect(result).toMatchObject({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://mock-services:8080/meta/v25.0/demo-pixel/events',
      expect.any(Object),
    );
  });
});
