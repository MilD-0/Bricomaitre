import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasDb: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb, getDb: mocks.getDb }));

import { loadInventoryPageData } from './admin-inventory-data';

describe('loadInventoryPageData', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads exact selected products even when they have no stock', async () => {
    mocks.hasDb.mockReturnValue(true);
    const countWhere = vi.fn().mockResolvedValue([{ value: 1 }]);
    const offset = vi.fn().mockResolvedValue([
      {
        id: 17,
        title: 'Selected wrench',
        sku: 'WRE-17',
        barcode: null,
        inStock: false,
        availabilityStatus: 'out_of_stock',
        inventoryQuantity: 0,
        updatedAt: new Date('2026-08-23T00:00:00.000Z'),
      },
    ]);
    const whereRows = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({ offset }),
      }),
    });
    const from = vi
      .fn()
      .mockReturnValueOnce({ where: countWhere })
      .mockReturnValueOnce({ where: whereRows });
    mocks.getDb.mockReturnValue({ select: vi.fn().mockReturnValue({ from }) });

    await expect(
      loadInventoryPageData({ page: 1, limit: 20, search: '' }, false, [17, 17]),
    ).resolves.toEqual({
      writable: false,
      items: [
        {
          id: 17,
          title: 'Selected wrench',
          sku: 'WRE-17',
          barcode: null,
          inStock: false,
          availabilityStatus: 'out_of_stock',
          inventoryQuantity: 0,
          updatedAt: '2026-08-23T00:00:00.000Z',
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
    expect(whereRows).toHaveBeenCalledOnce();
  });
});
