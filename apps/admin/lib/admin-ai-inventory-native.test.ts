import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  batch: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./admin-inventory-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-inventory-workflow')>()),
  applyAdminInventoryBatch: mocks.batch,
  inspectAdminInventoryScan: mocks.scan,
  updateAdminInventoryProduct: mocks.update,
}));

import {
  adminAiInventoryReceiptSchema,
  adminAiInventoryStateSchema,
  receiveAdminInventory,
  scanAdminInventory,
  updateAdminInventoryState,
} from './admin-ai-inventory';
import { AdminInventoryNotFoundError } from './admin-inventory-workflow';

const actor = { email: 'admin@example.com', name: 'Admin' };

describe('admin AI native inventory operations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the canonical scanner and preserves exact order receipt provenance', async () => {
    mocks.scan.mockResolvedValue({ kind: 'order', order: { id: 50 }, items: [] });
    await expect(scanAdminInventory({ query: ' 50 ' })).resolves.toMatchObject({ kind: 'order' });
    expect(mocks.scan).toHaveBeenCalledWith('database', { query: '50' });

    mocks.batch.mockResolvedValue({ ok: true, complete: true, items: [], skipped: [] });
    await receiveAdminInventory(
      {
        source: 'order_scan',
        orderId: 50,
        items: [
          { productId: 12, quantity: 2 },
          { productId: 18, quantity: 1 },
        ],
      },
      actor,
    );
    expect(mocks.batch).toHaveBeenCalledWith(
      'database',
      {
        mode: 'increase',
        items: [
          {
            productId: 12,
            quantity: 2,
            source: { type: 'order-scan', orderIds: [50] },
          },
          {
            productId: 18,
            quantity: 1,
            source: { type: 'order-scan', orderIds: [50] },
          },
        ],
      },
      actor,
    );
    expect(
      adminAiInventoryReceiptSchema.safeParse({
        source: 'order_scan',
        orderId: null,
        items: [{ productId: 12, quantity: 1 }],
      }).success,
    ).toBe(false);
  });

  it('updates explicit state fields once per product and reports partial failures', async () => {
    mocks.update
      .mockResolvedValueOnce({ id: 12, barcode: 'DRILL-12', inStock: false })
      .mockRejectedValueOnce(new AdminInventoryNotFoundError(99));

    await expect(
      updateAdminInventoryState(
        {
          items: [
            {
              productId: 12,
              operations: [
                { field: 'barcode', value: 'DRILL-12' },
                { field: 'inStock', value: false },
              ],
            },
            { productId: 99, operations: [{ field: 'barcode', value: null }] },
          ],
        },
        actor,
      ),
    ).resolves.toMatchObject({
      ok: false,
      updatedCount: 1,
      items: [{ productId: 12, fields: ['barcode', 'inStock'] }],
      failed: [{ productId: 99, fields: ['barcode'], code: 'product_not_found' }],
    });
    expect(mocks.update).toHaveBeenNthCalledWith(
      1,
      'database',
      12,
      { barcode: 'DRILL-12', inStock: false },
      actor,
    );
    expect(
      adminAiInventoryStateSchema.safeParse({
        items: [
          {
            productId: 12,
            operations: [
              { field: 'barcode', value: 'ONE' },
              { field: 'barcode', value: 'TWO' },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
