import { describe, expect, it, vi } from 'vitest';

import { assertCategoryParentAllowed, CategoryHierarchyError } from './category-hierarchy';

function hierarchyDb(rows: Array<{ id: number; parentId: number | null }>) {
  const queuedRows = [...rows];
  const limit = vi.fn(async () => {
    const row = queuedRows.shift();
    return row ? [row] : [];
  });
  return {
    execute: vi.fn(),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit })),
      })),
    })),
  };
}

describe('category hierarchy validation', () => {
  it('rejects self-parenting before querying the database', async () => {
    const db = hierarchyDb([]);
    await expect(assertCategoryParentAllowed(db as never, 4, 4)).rejects.toMatchObject({
      code: 'self_parent',
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it('rejects moving a category below a descendant', async () => {
    const db = hierarchyDb([{ id: 8, parentId: 4 }]);
    await expect(assertCategoryParentAllowed(db as never, 4, 8)).rejects.toEqual(
      expect.objectContaining<CategoryHierarchyError>({ code: 'descendant_cycle' }),
    );
  });

  it('accepts a finite parent chain and takes the hierarchy write lock', async () => {
    const db = hierarchyDb([
      { id: 8, parentId: 3 },
      { id: 3, parentId: null },
    ]);
    await expect(
      assertCategoryParentAllowed(db as never, 4, 8, { lockHierarchy: true }),
    ).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalledOnce();
  });
});
