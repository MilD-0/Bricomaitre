import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { brands, categories, products } from '@bric/db/schema';
import type { Transaction } from './action-history';
import { assertCategoryParentAllowed, CategoryHierarchyError } from './category-hierarchy';

const relationsSchema = z.object({
  productIds: z.array(z.number().int().positive()),
  childIds: z.array(z.number().int().positive()),
});
type Relations = z.infer<typeof relationsSchema>;

export class TaxonomyHistoryConflictError extends Error {}

export function isTaxonomyEntity(entityType: string) {
  return entityType === 'brands' || entityType === 'categories';
}

export async function lockTaxonomyHistory(tx: Transaction, entityType: string, id: number) {
  // Use the same hierarchy lock as ordinary reparenting, before locking rows.
  if (entityType === 'categories') await tx.execute(sql`select pg_advisory_xact_lock(42716421)`);
  const table = entityType === 'brands' ? brands : categories;
  await tx.execute(sql`select ${table.id} from ${table} where ${table.id} = ${id} for update`);
}

export async function readTaxonomyRelations(
  tx: Transaction,
  entityType: string,
  id: number,
): Promise<Relations> {
  const column = entityType === 'brands' ? products.brandId : products.categoryId;
  const assigned = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(column, id))
    .orderBy(asc(products.id));
  const children =
    entityType === 'categories'
      ? await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.parentId, id))
          .orderBy(asc(categories.id))
      : [];
  return { productIds: assigned.map((row) => row.id), childIds: children.map((row) => row.id) };
}

export async function restoreTaxonomyRelations(
  tx: Transaction,
  entityType: string,
  id: number,
  input: unknown,
) {
  if (input === undefined)
    throw new TaxonomyHistoryConflictError(
      'This older deletion has no relationship snapshot and cannot be fully recovered.',
    );
  const relations = relationsSchema.parse(input);
  if (relations.productIds.length) {
    const column = entityType === 'brands' ? products.brandId : products.categoryId;
    const restored = await tx
      .update(products)
      .set(entityType === 'brands' ? { brandId: id } : { categoryId: id })
      .where(and(inArray(products.id, relations.productIds), isNull(column)))
      .returning({ id: products.id });
    if (restored.length !== relations.productIds.length) {
      throw new TaxonomyHistoryConflictError(
        'A related product was removed or reassigned. Undo would overwrite newer work.',
      );
    }
  }
  for (const childId of relations.childIds) {
    try {
      await assertCategoryParentAllowed(tx, childId, id);
    } catch (error) {
      if (error instanceof CategoryHierarchyError)
        throw new TaxonomyHistoryConflictError(error.message);
      throw error;
    }
    const restored = await tx
      .update(categories)
      .set({ parentId: id })
      .where(and(eq(categories.id, childId), isNull(categories.parentId)))
      .returning({ id: categories.id });
    if (restored.length !== 1) {
      throw new TaxonomyHistoryConflictError(
        'A child category was removed or reparented. Undo would overwrite newer work.',
      );
    }
  }
}

export async function assertTaxonomyRelationsUnchanged(
  tx: Transaction,
  entityType: string,
  id: number,
  input: unknown,
) {
  if (input === undefined) return;
  const expected = relationsSchema.parse(input);
  const current = await readTaxonomyRelations(tx, entityType, id);
  if (JSON.stringify(current) !== JSON.stringify(expected)) {
    throw new TaxonomyHistoryConflictError(
      'Taxonomy assignments changed after Undo. Redo would remove newer work.',
    );
  }
}
