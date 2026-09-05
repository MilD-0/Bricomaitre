import { describe, expect, it, vi } from 'vitest';

import { loadArchivedProductsPage } from './product-archive';

describe('loadArchivedProductsPage', () => {
  it('counts and limits archived products before serializing the visible page', async () => {
    const offset = vi.fn().mockResolvedValue([
      {
        id: 7,
        title: 'Archived drill',
        sku: 'DRILL-7',
        barcode: null,
        archivedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ]);
    const limit = vi.fn(() => ({ offset }));
    const orderBy = vi.fn(() => ({ limit }));
    const countWhere = vi.fn().mockResolvedValue([{ value: 113 }]);
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce({ from: vi.fn(() => ({ where: countWhere })) })
        .mockReturnValueOnce({
          from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy })) })),
        }),
    };

    await expect(loadArchivedProductsPage(db as never, { page: 2, limit: 50 })).resolves.toEqual({
      items: [expect.objectContaining({ id: 7, archivedAt: '2026-08-01T00:00:00.000Z' })],
      pagination: {
        page: 2,
        limit: 50,
        totalItems: 113,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });
    expect(limit).toHaveBeenCalledWith(50);
    expect(offset).toHaveBeenCalledWith(50);
  });
});
