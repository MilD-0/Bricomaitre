import { describe, expect, it, vi } from 'vitest';

import {
  backfillOrderCommercialSnapshots,
  backfillOrderNormalizedPhones,
} from './order-commercial-backfill';

function databaseWithBatches(batches: unknown[][]) {
  const queued = [...batches];
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: vi.fn(async () => queued.shift() ?? []) })),
        })),
      })),
    })),
  };
}

describe('legacy order commercial snapshot backfill', () => {
  it('persists complete rows and reports rows whose historical products cannot be resolved', async () => {
    const db = databaseWithBatches([
      [
        { id: 2, cartProducts: ['9', '9'], promoCode: null, deliveryFee: '400', price: null },
        { id: 3, cartProducts: ['missing'], promoCode: null, deliveryFee: '500', price: null },
      ],
      [],
    ]);
    const persist = vi.fn().mockResolvedValue(undefined);
    const resolveCommercial = vi.fn(async (_db, row: { id: number }) => ({
      cartProducts: row.id === 2 ? ['9', '9'] : [],
      lines:
        row.id === 2
          ? [
              {
                productId: 9,
                contentId: '9',
                rawValue: '9',
                title: 'Drill',
                originalUnitPrice: 1000,
                effectiveUnitPrice: 1000,
                unitPurchasePrice: 600,
                quantity: 2,
                discountAmount: 0,
                lineTotal: 2000,
                thumbnailUrl: null,
              },
            ]
          : [],
      promo: null,
      productSubtotal: row.id === 2 ? 2000 : 0,
      originalProductSubtotal: row.id === 2 ? 2000 : 0,
      discountAmount: 0,
    }));

    await expect(
      backfillOrderCommercialSnapshots(db as never, { resolveCommercial, persist }),
    ).resolves.toEqual({ scanned: 2, backfilled: 1, unresolvedOrderIds: [3] });
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ id: 2 }),
      expect.any(Object),
    );
  });

  it('normalizes valid legacy phone formats and reports invalid values without inventing one', async () => {
    const db = databaseWithBatches([
      [
        { id: 4, phoneNumber1: '0555 12 34 56' },
        { id: 5, phoneNumber1: 'not-a-phone' },
      ],
      [],
    ]);
    const persist = vi.fn().mockResolvedValue(undefined);

    await expect(backfillOrderNormalizedPhones(db as never, { persist })).resolves.toEqual({
      scanned: 2,
      backfilled: 1,
      invalidOrderIds: [5],
    });
    expect(persist).toHaveBeenCalledWith(
      db,
      { id: 4, phoneNumber1: '0555 12 34 56' },
      '213555123456',
    );
  });
});
