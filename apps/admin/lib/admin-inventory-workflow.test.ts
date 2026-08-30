import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  history: vi.fn(),
  loadOrder: vi.fn(),
  readProduct: vi.fn(),
  revalidateTags: vi.fn(),
  revalidateStorefront: vi.fn(),
}));

vi.mock('./action-history', () => ({ mutateEntityWithHistory: mocks.history }));
vi.mock('./admin-orders-data', () => ({ loadOrderDetail: mocks.loadOrder }));
vi.mock('./inventory-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./inventory-actions')>()),
  applyInventoryQuantityChange: mocks.change,
  readInventoryProductById: mocks.readProduct,
}));
vi.mock('./server-cache', () => ({
  CACHE_TAGS: { products: 'products', productsMeta: 'products-meta' },
  revalidateServerTags: mocks.revalidateTags,
}));
vi.mock('./storefront-revalidate', () => ({
  revalidateStorefrontProducts: mocks.revalidateStorefront,
}));

import {
  AdminInventoryNotFoundError,
  applyAdminInventoryBatch,
  inspectAdminInventoryScan,
  updateAdminInventoryProduct,
} from './admin-inventory-workflow';

const actor = { email: 'admin@example.com', name: 'Admin' };

describe('canonical admin inventory workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readProduct.mockResolvedValue({ id: 12 });
    mocks.history.mockResolvedValue([
      {
        id: 12,
        title: 'Perceuse',
        barcode: 'DRILL-12',
        inStock: false,
        inventoryQuantity: 4,
      },
    ]);
  });

  it('updates barcode and sellability together through one history mutation', async () => {
    const db = { marker: 'database' };
    await expect(
      updateAdminInventoryProduct(
        db as never,
        12,
        { barcode: ' DRILL-12 ', inStock: false },
        actor,
      ),
    ).resolves.toMatchObject({ id: 12, barcode: 'DRILL-12', inStock: false });
    expect(mocks.history).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'products',
        entityId: 12,
        operation: 'update',
        actor,
      }),
    );
    expect(mocks.revalidateTags).toHaveBeenCalledWith('products', 'products-meta');
    expect(mocks.revalidateStorefront).toHaveBeenCalledOnce();

    const { execute } = mocks.history.mock.calls[0][1];
    const returning = vi.fn().mockResolvedValue([{ id: 12 }]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    await execute({ update: vi.fn(() => ({ set })) });
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        barcode: 'DRILL-12',
        inStock: false,
        availabilityStatus: 'out_of_stock',
        updatedAt: expect.any(Date),
      }),
    );

    mocks.readProduct.mockResolvedValueOnce(null);
    await expect(
      updateAdminInventoryProduct(db as never, 99, { inStock: true }),
    ).rejects.toBeInstanceOf(AdminInventoryNotFoundError);
  });

  it('applies a complete batch while preserving missing and insufficient rows', async () => {
    mocks.change
      .mockResolvedValueOnce({ kind: 'updated', previousQuantity: 2, nextQuantity: 5 })
      .mockResolvedValueOnce({ kind: 'insufficient', available: 1 })
      .mockResolvedValueOnce({ kind: 'missing' });

    await expect(
      applyAdminInventoryBatch(
        {} as never,
        {
          mode: 'increase',
          items: [
            { productId: 12, quantity: 3 },
            { productId: 13, quantity: 4 },
            { productId: 14, quantity: 1 },
          ],
        },
        actor,
      ),
    ).resolves.toEqual({
      ok: true,
      complete: false,
      items: [{ productId: 12, previousQuantity: 2, nextQuantity: 5 }],
      skipped: [
        { productId: 13, reason: 'insufficient', available: 1 },
        { productId: 14, reason: 'missing' },
      ],
    });
    expect(mocks.revalidateStorefront).toHaveBeenCalledOnce();
  });

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
