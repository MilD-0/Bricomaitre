import { describe, expect, it, vi } from 'vitest';

import { loadArchivedProducts } from './product-archive';

describe('loadArchivedProducts', () => {
  it('serializes archived products for the hidden archive page', async () => {
    const orderBy = vi.fn().mockResolvedValue([
      {
        id: 7,
        title: 'Archived drill',
        sku: 'DRILL-7',
        barcode: null,
        archivedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy })) })),
      })),
    };

    await expect(loadArchivedProducts(db as never)).resolves.toEqual([
      expect.objectContaining({ id: 7, archivedAt: '2026-08-01T00:00:00.000Z' }),
    ]);
  });
});
