import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  change: vi.fn(),
  revalidateTags: vi.fn(),
  revalidateStorefront: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./inventory-actions', () => ({ applyInventoryQuantityChange: mocks.change }));
vi.mock('./server-cache', () => ({
  CACHE_TAGS: { products: 'products', productsMeta: 'products-meta' },
  revalidateServerTags: mocks.revalidateTags,
}));
vi.mock('./storefront-revalidate', () => ({
  revalidateStorefrontProducts: mocks.revalidateStorefront,
}));

import { adjustAdminInventory } from './admin-ai-inventory';

describe('admin AI inventory adjustments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies exact resolved deltas with actor history and refreshes catalog consumers once', async () => {
    mocks.change
      .mockResolvedValueOnce({ kind: 'updated', previousQuantity: 4, nextQuantity: 9 })
      .mockResolvedValueOnce({ kind: 'updated', previousQuantity: 10, nextQuantity: 15 });

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
    expect(mocks.change).toHaveBeenNthCalledWith(1, 'database', {
      productId: 12,
      quantity: 5,
      mode: 'increase',
      actor: { email: 'admin@bricomaitre.com', name: 'Admin' },
    });
    expect(mocks.revalidateTags).toHaveBeenCalledWith('products', 'products-meta');
    expect(mocks.revalidateStorefront).toHaveBeenCalledOnce();
  });

  it('reports missing and insufficient rows without hiding successful adjustments', async () => {
    mocks.change
      .mockResolvedValueOnce({ kind: 'updated', previousQuantity: 8, nextQuantity: 6 })
      .mockResolvedValueOnce({ kind: 'insufficient', available: 1 })
      .mockResolvedValueOnce({ kind: 'missing' });

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
    expect(mocks.revalidateStorefront).toHaveBeenCalledOnce();
  });

  it('does not refresh catalog consumers when every adjustment is rejected', async () => {
    mocks.change.mockResolvedValue({ kind: 'insufficient', available: 0 });
    await adjustAdminInventory({
      mode: 'decrease',
      items: [{ productId: 12, quantity: 1 }],
    });
    expect(mocks.revalidateTags).not.toHaveBeenCalled();
    expect(mocks.revalidateStorefront).not.toHaveBeenCalled();
  });
});
