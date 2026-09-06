import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOrderRecordsByIds: vi.fn(),
  loadOrdersPageData: vi.fn(),
  searchProducts: vi.fn(),
}));

vi.mock('./admin-orders-data', () => ({
  loadOrderRecordsByIds: mocks.loadOrderRecordsByIds,
  loadOrdersPageData: mocks.loadOrdersPageData,
}));
vi.mock('./admin-assets-data', () => ({
  searchAssetProductOptions: mocks.searchProducts,
}));

import { findAdminProducts, inspectAdminOrders } from './admin-ai-domain';

describe('shared Admin AI source adapters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves product identities through the canonical product-option search', async () => {
    mocks.searchProducts.mockResolvedValue({
      items: [{ id: 12, title: 'Perceuse', slug: 'perceuse' }],
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });

    await expect(
      findAdminProducts({ query: 'perceuse', productIds: [], page: 1, limit: 10 }),
    ).resolves.toMatchObject({
      items: [{ id: 12, title: 'Perceuse' }],
      total: 1,
    });
    expect(mocks.searchProducts).toHaveBeenCalledWith({
      search: 'perceuse',
      ids: [],
      page: 1,
      limit: 10,
    });
  });

  it('preserves complete operational order evidence for exact inspection', async () => {
    mocks.loadOrderRecordsByIds.mockResolvedValue([
      {
        id: 42,
        createdAt: '2026-08-20T10:00:00.000Z',
        updatedAt: '2026-08-21T10:00:00.000Z',
        inHouseStatus: 2,
        noAnswerCount: 1,
        delivery: 0,
        state: 16,
        productSubtotal: 4_000,
        deliveryFee: 500,
        totalAmount: 4_500,
        firstName: 'Private',
        lastName: 'Customer',
        fullName: 'Private Customer',
        email: 'customer@example.com',
        phoneNumber1: '0555000000',
        phoneNumber2: null,
        homeAddress: 'Private address',
        note: 'Private note',
        orderProducts: [
          {
            productId: 9,
            title: 'Drill',
            quantity: 2,
            unitPrice: 2_000,
            lineTotal: 4_000,
            missing: false,
            rawValue: 'private raw value',
          },
        ],
        statusHistory: [
          {
            status: 2,
            noAnswerCount: 1,
            changedAt: '2026-08-21T10:00:00.000Z',
            changedBy: 'staff@example.com',
            changedByName: 'Staff Member',
          },
        ],
      },
    ]);

    const result = await inspectAdminOrders({ orderIds: [42, 43, 42] });
    expect(mocks.loadOrderRecordsByIds).toHaveBeenCalledWith([42, 43], undefined, {
      includeHistory: true,
    });
    expect(result.missingIds).toEqual([43]);
    expect(result.items[0]).toMatchObject({
      id: 42,
      status: 2,
      totalAmount: 4_500,
      customer: {
        fullName: 'Private Customer',
        email: 'customer@example.com',
        phoneNumber1: '0555000000',
        note: 'Private note',
      },
      delivery: { state: 16, homeAddress: 'Private address' },
      products: [{ productId: 9, title: 'Drill', quantity: 2, rawValue: 'private raw value' }],
      statusHistory: [{ changedBy: 'staff@example.com', changedByName: 'Staff Member' }],
    });
  });
});
