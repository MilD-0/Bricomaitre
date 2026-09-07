import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  groupedRows: [] as Array<Record<string, unknown>>,
  total: 0,
  groupedTotal: 0,
  loadOrderRecordsByIds: vi.fn(),
  loadShipment: vi.fn(),
  loadCapturedLines: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: () => ({
    select: mocks.select,
    query: {
      ecotrackOrderStates: { findMany: mocks.loadShipment },
      orderLineItems: { findMany: mocks.loadCapturedLines },
    },
  }),
}));
vi.mock('./admin-orders-data', () => ({ loadOrderRecordsByIds: mocks.loadOrderRecordsByIds }));

import {
  adminAiOrderQuerySchema,
  inspectAdminOrderDetails,
  queryAdminOrders,
} from './admin-ai-order-query';

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 91,
    firstName: 'Ada',
    lastName: 'Lovelace',
    phoneNumber1: '0550123456',
    phoneNumber2: null,
    note: null,
    homeAddress: '12 rue des Outils',
    city: 'Alger Centre',
    state: 16,
    delivery: 0,
    inHouseStatus: 7,
    noAnswerCount: 0,
    totalAmount: '15600.00',
    createdAt: new Date('2026-08-24T08:00:00.000Z'),
    updatedAt: new Date('2026-08-24T10:00:00.000Z'),
    ...overrides,
  };
}

describe('admin AI order query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.total = 1;
    mocks.groupedTotal = 0;
    mocks.groupedRows = [];
    mocks.rows = [
      {
        order: orderRow(),
        shipmentId: 7,
        provider: 'emir',
        trackingNumber: 'TRK-91',
        shipmentStatus: 'en_livraison',
        lastStatusSyncedAt: new Date('2026-08-24T09:55:00.000Z'),
      },
    ];
    mocks.select.mockImplementation((selection: Record<string, unknown>) => ({
      from: () => ({
        leftJoin: () => ({
          where: () =>
            'order' in selection
              ? {
                  orderBy: () => ({
                    limit: () => ({ offset: async () => mocks.rows }),
                  }),
                }
              : Promise.resolve([{ value: mocks.total }]),
        }),
        innerJoin: () => ({
          leftJoin: () => ({
            where: () =>
              'capturedTitle' in selection
                ? {
                    groupBy: () => ({
                      orderBy: () => ({
                        limit: () => ({ offset: async () => mocks.groupedRows }),
                      }),
                    }),
                  }
                : Promise.resolve([{ value: mocks.groupedTotal }]),
          }),
        }),
      }),
    }));
  });

  it('keeps every filter optional while validating only supplied operations', () => {
    expect(adminAiOrderQuerySchema.safeParse({}).success).toBe(true);
    expect(
      adminAiOrderQuerySchema.safeParse({
        filters: [
          {
            field: 'created_date',
            date: { kind: 'range', from: '2026-08-28', to: '2026-08-01' },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      adminAiOrderQuerySchema.safeParse({
        groupBy: { dimension: 'product', sortBy: 'units', direction: 'desc' },
        sort: { by: 'createdAt' },
      }).success,
    ).toBe(false);
  });

  it('returns paginated local and active EcoTrack status as separate facts', async () => {
    await expect(
      queryAdminOrders({
        filters: [
          { field: 'current_in_house_status', statuses: ['in_delivery'] },
          {
            field: 'in_house_status_history',
            statuses: ['confirmed'],
            date: { kind: 'day', date: '2026-08-24' },
          },
          { field: 'ecotrack_link', state: 'active' },
        ],
        sort: { by: 'customerName' },
      }),
    ).resolves.toMatchObject({
      kind: 'orders',
      items: [
        {
          id: 91,
          customerName: 'Ada Lovelace',
          inHouseStatus: { name: 'in_delivery', value: 7 },
          activeEcotrackShipment: {
            provider: 'emir',
            trackingNumber: 'TRK-91',
            shipmentStatus: 'en_livraison',
          },
        },
      ],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
  });

  it('groups the entire filtered population by captured product with exact counts', async () => {
    mocks.total = 761;
    mocks.groupedTotal = 2;
    mocks.groupedRows = [
      {
        groupingKey: 'product:12',
        productId: 12,
        capturedReference: '12',
        capturedTitle: 'Perceuse',
        orderCount: 83,
        units: 91,
      },
      {
        groupingKey: 'captured:legacy-saw',
        productId: null,
        capturedReference: 'legacy-saw',
        capturedTitle: 'Scie historique',
        orderCount: 4,
        units: 4,
      },
    ];

    await expect(
      queryAdminOrders({
        filters: [
          {
            field: 'in_house_status_history',
            statuses: ['returned'],
            date: { kind: 'range', from: '2026-08-01', to: '2026-08-17' },
          },
        ],
        groupBy: { dimension: 'product', sortBy: 'units', direction: 'desc' },
        page: 1,
        limit: 50,
      }),
    ).resolves.toEqual({
      kind: 'order_product_summary',
      appliedQuery: {
        filters: [
          {
            field: 'in_house_status_history',
            statuses: ['returned'],
            date: { kind: 'range', from: '2026-08-01', to: '2026-08-17' },
          },
        ],
        groupBy: { dimension: 'product', sortBy: 'units', direction: 'desc' },
        page: 1,
        limit: 50,
      },
      matchedOrders: 761,
      items: [
        {
          productId: 12,
          capturedReference: '12',
          capturedTitle: 'Perceuse',
          orderCount: 83,
          units: 91,
        },
        {
          productId: null,
          capturedReference: 'legacy-saw',
          capturedTitle: 'Scie historique',
          orderCount: 4,
          units: 4,
        },
      ],
      pagination: {
        page: 1,
        limit: 50,
        totalItems: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });
});

describe('admin AI exact order inspection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadCapturedLines.mockResolvedValue([]);
    mocks.loadOrderRecordsByIds.mockImplementation(async () => [
      {
        ...orderRow(),
        fullName: 'Ada Lovelace',
        publicToken: 'public-token',
        ecotrackTrackingNumber: null,
        cartProducts: ['12'],
        orderProducts: [{ productId: 12, title: 'Perceuse', quantity: 1 }],
        subtotalOverride: null,
        productSubtotal: 15_000,
        deliveryFee: 600,
        totalAmount: 15_600,
        promoCode: null,
        promoProductId: null,
        promoOriginalSubtotal: null,
        promoDiscountAmount: 0,
        promoFinalSubtotal: null,
        email: null,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        variant: null,
        isDegradedCapture: false,
        hasStatusHistory: true,
        statusHistory: [
          {
            id: 1,
            status: 2,
            noAnswerCount: 0,
            changedAt: '2026-08-24T08:30:00.000Z',
            changedBy: 'ops@example.com',
            changedByName: 'Ops',
          },
        ],
      },
    ]);
    mocks.loadShipment.mockImplementation(async ({ where }: { where: unknown }) => {
      void where;
      return [
        {
          orderId: 91,
          provider: 'delivro',
          reference: '91',
          trackingNumber: 'OLD-91',
          currentStatus: 'prete_a_expedier',
          currentAmount: '15600.00',
          deliveryTariff: null,
          returnTariff: null,
          providerCreatedAt: new Date('2026-08-24T09:00:00.000Z'),
          providerUpdatedAt: null,
          lastStatusSyncedAt: null,
          deletedAt: new Date('2026-08-24T10:00:00.000Z'),
        },
      ];
    });
  });

  it.each([
    ['800.50', 'captured', 800.5],
    ['0.00', 'captured', 0],
    [null, 'legacy_not_recorded', null],
  ])(
    'returns captured purchase cost %s without a catalog fallback',
    async (cost, source, expected) => {
      mocks.loadCapturedLines.mockResolvedValue([
        {
          orderId: 91,
          productId: null,
          contentId: 'legacy-drill',
          titleSnapshot: 'Perceuse historique',
          quantity: 2,
          originalUnitPrice: '1500.00',
          effectiveUnitPrice: '1400.00',
          unitPurchasePriceSnapshot: cost,
          purchaseCostSource: source,
          lineTotal: '2800.00',
        },
        { orderId: 92, contentId: 'another-order' },
      ]);
      const result = await inspectAdminOrderDetails({ orderIds: [91] });
      expect(mocks.loadCapturedLines).toHaveBeenCalledOnce();
      expect(result.items[0].capturedLineItems).toEqual([
        {
          productId: null,
          capturedReference: 'legacy-drill',
          title: 'Perceuse historique',
          quantity: 2,
          originalUnitPriceDzd: 1500,
          effectiveUnitPriceDzd: 1400,
          unitPurchaseCostDzd: expected,
          purchaseCostSource: source,
          lineTotalDzd: 2800,
        },
      ]);
    },
  );

  it('includes captured order history and a deleted shipment without conflating statuses', async () => {
    const result = await inspectAdminOrderDetails({ orderIds: [404, 91, 91] });

    expect(mocks.loadOrderRecordsByIds).toHaveBeenCalledWith([404, 91], expect.any(Object), {
      includeHistory: true,
    });
    expect(mocks.loadOrderRecordsByIds).toHaveBeenCalledOnce();
    expect(result.items[0].capturedLineItems).toEqual([]);
    expect(mocks.loadShipment).toHaveBeenCalledOnce();
    expect(result.requestedIds).toEqual([404, 91]);
    expect(result.missingIds).toEqual([404]);
    expect(result.items[0]).toMatchObject({
      id: 91,
      inHouseStatus: { name: 'in_delivery', value: 7 },
      inHouseStatusHistory: [{ inHouseStatus: { name: 'confirmed', value: 2 } }],
      ecotrackShipment: {
        state: 'deleted',
        trackingNumber: 'OLD-91',
        shipmentStatus: 'prete_a_expedier',
      },
    });
    expect(result.items[0]).not.toHaveProperty('confirmed');
    expect(result.items[0]).not.toHaveProperty('ecotrackTrackingNumber');
  });
});
