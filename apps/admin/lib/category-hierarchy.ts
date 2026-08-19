import { eq, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { categories } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class CategoryHierarchyError extends Error {
  constructor(
    message: string,
    readonly code: 'parent_missing' | 'self_parent' | 'descendant_cycle' | 'existing_cycle',
  ) {
    super(message);
    this.name = 'CategoryHierarchyError';
  }
}

export async function assertCategoryParentAllowed(
  db: Database | Transaction,
  categoryId: number | null,
  parentId: number | null,
  options: { lockHierarchy?: boolean } = {},
) {
  if (parentId === null) return;
  if (categoryId === parentId) {
    throw new CategoryHierarchyError('A category cannot be its own parent.', 'self_parent');
  }

  // Serialize hierarchy writes so two concurrent reparenting operations cannot
  // each validate against a stale tree and create a cycle together.
  if (options.lockHierarchy) {
    await db.execute(sql`select pg_advisory_xact_lock(42716421)`);
  }

  const visited = new Set<number>();
  let cursor: number | null = parentId;
  while (cursor !== null) {
    if (visited.has(cursor)) {
      throw new CategoryHierarchyError(
        'The existing category hierarchy already contains a cycle.',
        'existing_cycle',
      );
    }
    if (categoryId !== null && cursor === categoryId) {
      throw new CategoryHierarchyError(
        'A category cannot be moved below one of its descendants.',
        'descendant_cycle',
      );
    }
    visited.add(cursor);
    const [row] = await db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
      .where(eq(categories.id, cursor))
      .limit(1);
    if (!row) {
      throw new CategoryHierarchyError('Parent category not found.', 'parent_missing');
    }
    cursor = row.parentId;
  }
}
