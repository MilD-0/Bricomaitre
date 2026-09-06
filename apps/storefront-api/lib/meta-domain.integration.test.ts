import {
  metaEventOutbox,
  orderLineItems,
  orderMetaAttribution,
  orders,
  products,
} from '@bric/db/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { storefrontAnalyticsEventSchema } from '@bric/storefront-core/analytics';
import {
  buildMetaCommerceCustomData,
  buildMetaUserData,
  enqueueMetaBrowserEvent,
  ensureOrderCompletedEventForOrder,
  ensureOrderConfirmedEventForOrder,
  getOrderCompletedEventId,
  getOrderConfirmedEventId,
  isMetaCompletedStatus,
  isMetaOrderConfirmedStatus,
  normalizeAlgeriaPhone,
  normalizeMetaEventTime,
  reconcileOrderConfirmedEvents,
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

  it('uses custom status event allow-lists', () => {
    expect(isMetaOrderConfirmedStatus(2)).toBe(true);
    expect([0, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11].some(isMetaOrderConfirmedStatus)).toBe(false);
    expect(getOrderConfirmedEventId(42)).toBe('order:42:confirmed:v1');
    expect([4, 10].every(isMetaCompletedStatus)).toBe(true);
    expect([0, 1, 2, 3, 5, 6, 7, 8, 9, 11].some(isMetaCompletedStatus)).toBe(false);
    expect(getOrderCompletedEventId(42)).toBe('order:42:completed:v1');
  });

  it('queues Search with search_string without resolving commerce lines', async () => {
    const valuesMock = vi.fn();
    const db = {
      select: vi.fn(() => {
        throw new Error('Search must not query product lines');
      }),
      insert: vi.fn(() => ({
        values: (values: Record<string, unknown>) => {
          valuesMock(values);
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ id: 1 }],
            }),
          };
        },
      })),
    };

    await enqueueMetaBrowserEvent(
      db as never,
      {
        eventId: 'search-1',
        eventName: 'Search',
        eventSourceUrl: 'https://bricomaitre.com/products?search=perceuse',
        searchTerm: 'perceuse',
        items: [],
      },
      {},
    );

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'Search',
        customData: { search_string: 'perceuse' },
      }),
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('queues one CAPI-only orderconfirmed event with order status and subtotal', async () => {
    const insertedValues = vi.fn();
    const attribution = {
      orderId: 42,
      semanticsVersion: 'confirmed_purchase_v1',
      eventSourceUrl: 'https://bricomaitre.com/checkout',
      externalIdSource: 'visit-1',
      fbc: 'fb.1.1700000000.click',
      fbp: 'fb.1.1700000000.123',
      clientIpAddress: '203.0.113.10',
      clientUserAgent: 'Vitest',
    };
    const order = {
      id: 42,
      email: 'buyer@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phoneNumber1: '0550112233',
      city: 'Alger',
      state: 16,
      cartProducts: ['12', '12'],
      promoCode: null,
    };
    const line = {
      id: 1,
      orderId: 42,
      productId: 12,
      contentId: '12',
      rawValue: '12',
      titleSnapshot: 'Drill',
      originalUnitPrice: '1000.00',
      effectiveUnitPrice: '800.00',
      quantity: 2,
      discountAmount: '400.00',
      lineTotal: '1600.00',
      thumbnailUrl: null,
    };
    let selectCall = 0;
    const db = {
      select: vi.fn(() => {
        selectCall += 1;
        const rows =
          selectCall === 1
            ? [attribution]
            : selectCall === 2
              ? [order]
              : selectCall === 3
                ? []
                : [line];
        return {
          from: () => ({
            where: () => (selectCall <= 3 ? { limit: async () => rows } : Promise.resolve(rows)),
          }),
        };
      }),
      insert: vi.fn(() => ({
        values: (values: Record<string, unknown>) => {
          insertedValues(values);
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ id: 98 }],
            }),
          };
        },
      })),
      transaction: vi.fn((callback: (tx: unknown) => unknown) =>
        callback({
          delete: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
          insert: vi.fn(() => ({
            values: vi.fn().mockResolvedValue(undefined),
          })),
        }),
      ),
    };

    const result = await ensureOrderConfirmedEventForOrder(db as never, {
      orderId: 42,
      statusHistoryId: 6,
      status: 2,
      changedAt: new Date('2026-06-23T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      created: true,
      outboxId: 98,
      eventId: 'order:42:confirmed:v1',
    });
    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'orderconfirmed',
        eventId: 'order:42:confirmed:v1',
        source: 'order_confirmation',
        orderId: 42,
        orderStatusHistoryId: 6,
        eventSourceUrl: 'https://bricomaitre.com/checkout',
        customData: expect.objectContaining({
          order_id: '42',
          order_status: 2,
          value: 1600,
        }),
      }),
    );
  });

  it('queues one CAPI-only OrderCompleted event with order status and subtotal', async () => {
    const insertedValues = vi.fn();
    const attribution = {
      orderId: 42,
      semanticsVersion: 'confirmed_purchase_v1',
      eventSourceUrl: 'https://bricomaitre.com/checkout',
      externalIdSource: 'visit-1',
      fbc: 'fb.1.1700000000.click',
      fbp: 'fb.1.1700000000.123',
      clientIpAddress: '203.0.113.10',
      clientUserAgent: 'Vitest',
    };
    const order = {
      id: 42,
      email: 'buyer@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phoneNumber1: '0550112233',
      city: 'Alger',
      state: 16,
      cartProducts: ['12'],
      promoCode: null,
    };
    const line = {
      id: 1,
      orderId: 42,
      productId: 12,
      contentId: '12',
      rawValue: '12',
      titleSnapshot: 'Drill',
      originalUnitPrice: '1000.00',
      effectiveUnitPrice: '800.00',
      quantity: 2,
      discountAmount: '400.00',
      lineTotal: '1600.00',
      thumbnailUrl: null,
    };
    let selectCall = 0;
    const db = {
      select: vi.fn(() => {
        selectCall += 1;
        const rows =
          selectCall === 1
            ? [attribution]
            : selectCall === 2
              ? [order]
              : selectCall === 3
                ? []
                : [line];
        return {
          from: () => ({
            where: () => (selectCall <= 3 ? { limit: async () => rows } : Promise.resolve(rows)),
          }),
        };
      }),
      insert: vi.fn(() => ({
        values: (values: Record<string, unknown>) => {
          insertedValues(values);
          return {
            onConflictDoNothing: () => ({
              returning: async () => [{ id: 99 }],
            }),
          };
        },
      })),
    };

    const result = await ensureOrderCompletedEventForOrder(db as never, {
      orderId: 42,
      statusHistoryId: 7,
      status: 4,
      changedAt: new Date('2026-06-23T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      created: true,
      outboxId: 99,
      eventId: 'order:42:completed:v1',
    });
    expect(insertedValues).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'OrderCompleted',
        eventId: 'order:42:completed:v1',
        source: 'order_completion',
        orderId: 42,
        orderStatusHistoryId: 7,
        eventSourceUrl: 'https://bricomaitre.com/checkout',
        customData: expect.objectContaining({
          order_id: '42',
          order_status: 4,
          value: 1600,
        }),
      }),
    );
  });

  describe.each([
    { name: 'confirmation', ensure: ensureOrderConfirmedEventForOrder, status: 2 },
    { name: 'completion', ensure: ensureOrderCompletedEventForOrder, status: 4 },
  ])('$name snapshot preservation', ({ ensure, status }) => {
    function fixture({ missing = false, failInsert = false } = {}) {
      const line = {
        orderId: 42,
        productId: 12,
        contentId: '12',
        rawValue: '12',
        titleSnapshot: 'Drill',
        originalUnitPrice: '4500.00',
        effectiveUnitPrice: '4500.00',
        unitPurchasePriceSnapshot: '3000.00',
        quantity: 1,
        discountAmount: '0.00',
        lineTotal: '4500.00',
        thumbnailUrl: null,
      };
      const savedLines = missing ? [] : [line];
      const originalLines = structuredClone(savedLines);
      const catalog = { id: 12, price: '5000.00', purchasePrice: '3500.00', images: [] };
      const outbox: Record<string, unknown>[] = [];
      const catalogRead = vi.fn(() => [catalog]);
      const db = {
        execute: vi.fn(async () => ({
          rows: [{ history_id: 6, order_id: 42, status: 2, changed_at: new Date() }],
        })),
        select: () => ({
          from: (table: unknown) => ({
            where: () => {
              const rows =
                table === orderMetaAttribution
                  ? [{ orderId: 42, externalIdSource: 'visit-1' }]
                  : table === orders
                    ? [
                        {
                          id: 42,
                          cartProducts: ['12'],
                          promoCode: null,
                          phoneNumber1: '0550112233',
                        },
                      ]
                    : table === orderLineItems
                      ? savedLines
                      : table === metaEventOutbox
                        ? outbox
                        : table === products
                          ? catalogRead()
                          : [];
              return Object.assign(Promise.resolve(rows), { limit: async () => rows });
            },
          }),
        }),
        transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
          callback({
            delete: () => ({
              where: async () => {
                savedLines.length = 0;
              },
            }),
            insert: () => ({
              values: async (rows: typeof savedLines) => {
                savedLines.push(...rows);
              },
            }),
          }),
        ),
        insert: (table: unknown) => ({
          values: (value: Record<string, unknown>) => ({
            onConflictDoNothing: () => ({
              returning: async () => {
                expect(table).toBe(metaEventOutbox);
                if (failInsert) throw new Error('outbox unavailable');
                outbox.push(value);
                return [{ id: 98 }];
              },
            }),
          }),
        }),
      };
      return { db, savedLines, originalLines, outbox, catalogRead };
    }

    const input = () => ({ orderId: 42, statusHistoryId: 6, status, changedAt: new Date() });

    it('uses saved prices and preserves costs after the catalog changes', async () => {
      const f = fixture();
      if (status === 2) {
        expect(await reconcileOrderConfirmedEvents(f.db as never)).toEqual({
          confirmationScanned: 1,
          confirmationCreated: 1,
        });
      } else {
        expect(await ensure(f.db as never, input())).toMatchObject({ created: true });
      }
      expect(f.outbox[0].customData).toMatchObject({ value: 4500 });
      expect(f.savedLines).toEqual(f.originalLines);
      expect(f.catalogRead).not.toHaveBeenCalled();
      expect(f.db.transaction).not.toHaveBeenCalled();
    });

    it('leaves missing snapshots absent and skips event creation', async () => {
      const f = fixture({ missing: true });
      expect(await ensure(f.db as never, input())).toEqual({
        created: false,
        reason: 'missing_lines',
      });
      expect(f.savedLines).toEqual([]);
      expect(f.outbox).toEqual([]);
      expect(f.catalogRead).not.toHaveBeenCalled();
      expect(f.db.transaction).not.toHaveBeenCalled();
    });

    it('preserves snapshots when outbox insertion fails', async () => {
      const f = fixture({ failInsert: true });
      await expect(ensure(f.db as never, input())).rejects.toThrow('outbox unavailable');
      expect(f.savedLines).toEqual(f.originalLines);
      expect(f.db.transaction).not.toHaveBeenCalled();
    });
  });

  it('preserves long paid landing paths instead of truncating fbclid data', () => {
    const pagePath = `/products/12?fbclid=${'x'.repeat(900)}&utm_campaign=carousel`;
    const parsed = storefrontAnalyticsEventSchema.parse({
      eventId: 'analytics-1',
      journeyId: 'journey-1',
      sessionId: 'session-1',
      eventName: 'page_view',
      pagePath,
    });
    expect(parsed.pagePath).toBe(pagePath);
  });

  it('normalizes Algeria phone numbers and clamps future timestamps', () => {
    expect(normalizeAlgeriaPhone('0550 11 22 33')).toBe('213550112233');
    const now = new Date('2026-06-23T00:00:00.000Z');
    expect(normalizeMetaEventTime(new Date('2026-06-23T01:00:00.000Z'), now)).toEqual({
      kind: 'clamped',
      value: now,
    });
    expect(normalizeMetaEventTime(new Date('2026-06-01T00:00:00.000Z'), now).kind).toBe('expired');
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
