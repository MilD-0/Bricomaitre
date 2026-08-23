import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '@bric/db/client';
import { brands, categories } from '@bric/db/schema';
import { mutateEntityWithHistory, type ActionActor } from './action-history';
import {
  readBrand,
  readCategory,
  resolveBrandSlug,
  resolveCategorySlug,
} from './brands-categories-api';
import {
  brandFormSchema,
  brandUpdateSchema,
  categoryFormSchema,
  categoryUpdateSchema,
} from './brands-categories';
import { assertCategoryParentAllowed } from './category-hierarchy';

type Database = ReturnType<typeof getDb>;

export const brandCreateSchema = brandFormSchema.extend({
  status: z.enum(['active', 'draft']).default('active'),
});
export const categoryCreateSchema = categoryFormSchema.extend({
  status: z.enum(['active', 'draft']).default('active'),
});

export class TaxonomyMutationNotFoundError extends Error {
  constructor(
    readonly kind: 'brand' | 'category',
    readonly id: number,
  ) {
    super(`${kind === 'brand' ? 'Brand' : 'Category'} ${id} was not found.`);
    this.name = 'TaxonomyMutationNotFoundError';
  }
}

export async function createBrandThroughCanonicalWorkflow(
  db: Database,
  input: unknown,
  actor?: ActionActor,
) {
  const data = brandCreateSchema.parse(input);
  const slug = await resolveBrandSlug(data.name, undefined, db);
  const rows = await mutateEntityWithHistory(db, {
    entityType: 'brands',
    operation: 'create',
    actor,
    execute: (tx) =>
      tx
        .insert(brands)
        .values({
          name: data.name,
          slug,
          isActive: data.status === 'active',
          image: data.imageUrl,
          createdBy: actor?.email ?? null,
          createdByName: actor?.name ?? null,
          updatedBy: actor?.email ?? null,
          updatedByName: actor?.name ?? null,
        })
        .returning({ id: brands.id }),
    resolveEntityId: (result) => result[0]?.id,
  });
  return { kind: 'brand' as const, id: rows?.[0]?.id ?? null, slug, ...data };
}

export async function updateBrandThroughCanonicalWorkflow(
  db: Database,
  id: number,
  input: unknown,
  actor?: ActionActor,
) {
  const data = brandUpdateSchema.parse(input);
  if (!(await readBrand(id))) throw new TaxonomyMutationNotFoundError('brand', id);
  let slug: string | undefined;
  await mutateEntityWithHistory(db, {
    entityType: 'brands',
    entityId: id,
    operation: 'update',
    actor,
    execute: async (tx) => {
      const update: Partial<typeof brands.$inferInsert> & { updatedAt: Date } = {
        updatedAt: new Date(),
        updatedBy: actor?.email ?? null,
        updatedByName: actor?.name ?? null,
      };
      if (data.name !== undefined) {
        update.name = data.name;
        slug = await resolveBrandSlug(data.name, id, tx);
        update.slug = slug;
      }
      if (data.imageUrl !== undefined) update.image = data.imageUrl;
      if (data.status !== undefined) update.isActive = data.status === 'active';
      await tx.update(brands).set(update).where(eq(brands.id, id));
    },
  });
  return { kind: 'brand' as const, id, ...(slug ? { slug } : {}), changes: data };
}

export async function deleteBrandThroughCanonicalWorkflow(
  db: Database,
  id: number,
  actor?: ActionActor,
) {
  if (!(await readBrand(id))) throw new TaxonomyMutationNotFoundError('brand', id);
  await mutateEntityWithHistory(db, {
    entityType: 'brands',
    entityId: id,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(brands).where(eq(brands.id, id)),
  });
  return { kind: 'brand' as const, id, deleted: true as const };
}

export async function createCategoryThroughCanonicalWorkflow(
  db: Database,
  input: unknown,
  actor?: ActionActor,
) {
  const data = categoryCreateSchema.parse(input);
  const slug = await resolveCategorySlug(data.name, undefined, db);
  const rows = await mutateEntityWithHistory(db, {
    entityType: 'categories',
    operation: 'create',
    actor,
    execute: async (tx) => {
      await assertCategoryParentAllowed(tx, null, data.parentId ?? null, { lockHierarchy: true });
      return tx
        .insert(categories)
        .values({
          name: data.name,
          slug,
          nameAr: data.nameAr,
          image: data.imageUrl,
          parentId: data.parentId ?? null,
          isActive: data.status === 'active',
          createdBy: actor?.email ?? null,
          createdByName: actor?.name ?? null,
          updatedBy: actor?.email ?? null,
          updatedByName: actor?.name ?? null,
        })
        .returning({ id: categories.id });
    },
    resolveEntityId: (result) => result[0]?.id,
  });
  return { kind: 'category' as const, id: rows?.[0]?.id ?? null, slug, ...data };
}

export async function updateCategoryThroughCanonicalWorkflow(
  db: Database,
  id: number,
  input: unknown,
  actor?: ActionActor,
) {
  const data = categoryUpdateSchema.parse(input);
  if (!(await readCategory(id))) throw new TaxonomyMutationNotFoundError('category', id);
  let slug: string | undefined;
  await mutateEntityWithHistory(db, {
    entityType: 'categories',
    entityId: id,
    operation: 'update',
    actor,
    execute: async (tx) => {
      if (data.parentId !== undefined) {
        await assertCategoryParentAllowed(tx, id, data.parentId ?? null, { lockHierarchy: true });
      }
      const update: Partial<typeof categories.$inferInsert> & { updatedAt: Date } = {
        updatedAt: new Date(),
        updatedBy: actor?.email ?? null,
        updatedByName: actor?.name ?? null,
      };
      if (data.name !== undefined) {
        update.name = data.name;
        slug = await resolveCategorySlug(data.name, id, tx);
        update.slug = slug;
      }
      if (data.nameAr !== undefined) update.nameAr = data.nameAr;
      if (data.imageUrl !== undefined) update.image = data.imageUrl;
      if (data.parentId !== undefined) update.parentId = data.parentId ?? null;
      if (data.status !== undefined) update.isActive = data.status === 'active';
      await tx.update(categories).set(update).where(eq(categories.id, id));
    },
  });
  return { kind: 'category' as const, id, ...(slug ? { slug } : {}), changes: data };
}

export async function deleteCategoryThroughCanonicalWorkflow(
  db: Database,
  id: number,
  actor?: ActionActor,
) {
  if (!(await readCategory(id))) throw new TaxonomyMutationNotFoundError('category', id);
  await mutateEntityWithHistory(db, {
    entityType: 'categories',
    entityId: id,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(categories).where(eq(categories.id, id)),
  });
  return { kind: 'category' as const, id, deleted: true as const };
}
