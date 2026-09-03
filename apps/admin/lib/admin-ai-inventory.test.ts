import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  batch: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./admin-inventory-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-inventory-workflow')>()),
  applyAdminInventoryBatch: mocks.batch,
}));

import { adjustAdminInventory } from './admin-ai-inventory';

describe('admin AI inventory adjustments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes exact resolved deltas and actor history to the canonical batch workflow', async () => {
    mocks.batch.mockResolvedValue({
      ok: true,
      complete: true,
      items: [
        { productId: 12, previousQuantity: 4, nextQuantity: 9 },
        { productId: 18, previousQuantity: 10, nextQuantity: 15 },
      ],
      skipped: [],
    });

    await expect(
      adjustAdminInventory(
        {
          mode: 'increase',
          items: [
            { productId: 12, quantity: 5 },
            { productId: 18, quantity: 5 },
          ],
        },
        { email: 'admin@bricomaitre.com', name: 'Admin' },
      ),
    ).resolves.toEqual({
      ok: true,
      items: [
        { productId: 12, previousQuantity: 4, nextQuantity: 9 },
        { productId: 18, previousQuantity: 10, nextQuantity: 15 },
      ],
      skipped: [],
    });
    expect(mocks.batch).toHaveBeenCalledWith(
      'database',
      {
        requestId: expect.any(String),
        mode: 'increase',
        items: [
          { productId: 12, quantity: 5 },
          { productId: 18, quantity: 5 },
        ],
      },
      { email: 'admin@bricomaitre.com', name: 'Admin' },
    );
  });

  it('reports missing and insufficient rows without hiding successful adjustments', async () => {
    mocks.batch.mockResolvedValue({
      ok: true,
      complete: false,
      items: [{ productId: 1, previousQuantity: 8, nextQuantity: 6 }],
      skipped: [
        { productId: 2, reason: 'insufficient', available: 1 },
        { productId: 3, reason: 'missing' },
      ],
    });

    await expect(
      adjustAdminInventory({
        mode: 'decrease',
        items: [
          { productId: 1, quantity: 2 },
          { productId: 2, quantity: 4 },
          { productId: 3, quantity: 1 },
        ],
      }),
    ).resolves.toEqual({
      ok: false,
      items: [{ productId: 1, previousQuantity: 8, nextQuantity: 6 }],
      skipped: [
        { productId: 2, reason: 'insufficient', available: 1 },
        { productId: 3, reason: 'missing' },
      ],
    });
  });
});
