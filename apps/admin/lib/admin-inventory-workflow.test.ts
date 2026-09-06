import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ loadOrder: vi.fn() }));

vi.mock('./admin-orders-data', () => ({ loadOrderDetail: mocks.loadOrder }));
import { inspectAdminInventoryScan } from './admin-inventory-workflow';

describe('inventory scan preview', () => {
  beforeEach(() => vi.clearAllMocks());

  it('previews an exact order scan with catalog-match and current-quantity evidence', async () => {
    mocks.loadOrder.mockResolvedValue({
      id: 50,
      fullName: 'Client Test',
      orderProducts: [
        { productId: 12, title: 'Perceuse', quantity: 2 },
        { productId: null, title: 'Ancien produit', quantity: 1 },
      ],
    });
    const where = vi.fn().mockResolvedValue([{ id: 12, inventoryQuantity: 4 }]);
    const db = { select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })) };

    await expect(inspectAdminInventoryScan(db as never, { query: '50' })).resolves.toEqual({
      kind: 'order',
      order: { id: 50, fullName: 'Client Test' },
      items: [
        {
          productId: 12,
          title: 'Perceuse',
          quantity: 2,
          inventoryQuantity: 4,
          selectable: true,
        },
        {
          productId: null,
          title: 'Ancien produit',
          quantity: 1,
          inventoryQuantity: null,
          selectable: false,
          reason: 'Missing catalog match.',
        },
      ],
    });
  });

  it('falls back from a numeric miss to an exact barcode lookup', async () => {
    mocks.loadOrder.mockResolvedValue(null);
    const limit = vi.fn().mockResolvedValue([{ id: 12, barcode: '50', inventoryQuantity: 4 }]);
    const db = {
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit })) })) })),
    };
    await expect(inspectAdminInventoryScan(db as never, { query: '50' })).resolves.toMatchObject({
      kind: 'barcode',
      item: { id: 12, barcode: '50' },
    });
  });
});
