import { getDb, getPool } from '@bric/db/client';
import { actionLogs, brands, categories, products } from '@bric/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';

import { ActionHistoryEntityNotFoundError } from '../lib/action-history-state';
import { CategoryHierarchyError } from '../lib/category-hierarchy';
import {
  createBrandThroughCanonicalWorkflow,
  createCategoryThroughCanonicalWorkflow,
  deleteBrandThroughCanonicalWorkflow,
  deleteCategoryThroughCanonicalWorkflow,
  updateBrandThroughCanonicalWorkflow,
  updateCategoryThroughCanonicalWorkflow,
} from '../lib/taxonomy-mutations';

afterAll(async () => {
  await getPool().end();
});

it('persists taxonomy changes and relations, rejects cycles and missing targets through the same history transaction', async () => {
  const db = getDb();
  const marker = randomUUID();
  const actor = { email: `taxonomy-${marker}@example.invalid`, name: 'Taxonomy operator' };
  const brand = await createBrandThroughCanonicalWorkflow(
    db,
    { name: `Brand ${marker}`, status: 'draft' },
    actor,
  );
  const parent = await createCategoryThroughCanonicalWorkflow(
    db,
    { name: `Parent ${marker}` },
    actor,
  );
  const child = await createCategoryThroughCanonicalWorkflow(
    db,
    { name: `Child ${marker}`, parentId: parent.id },
    actor,
  );
  const [product] = await db
    .insert(products)
    .values({
      title: 'Assigned product',
      slug: `taxonomy-${marker}`,
      price: '1000',
      brandId: brand.id,
      categoryId: child.id,
    })
    .returning();
  try {
    await updateBrandThroughCanonicalWorkflow(
      db,
      brand.id!,
      { status: 'active', name: `Renamed ${marker}` },
      actor,
    );
    await updateCategoryThroughCanonicalWorkflow(
      db,
      child.id!,
      { nameAr: 'أدوات كهربائية', status: 'draft' },
      actor,
    );
    expect((await db.select().from(brands).where(eq(brands.id, brand.id!)))[0]).toMatchObject({
      name: `Renamed ${marker}`,
      isActive: true,
      updatedBy: actor.email,
    });
    expect(
      (await db.select().from(categories).where(eq(categories.id, child.id!)))[0],
    ).toMatchObject({ parentId: parent.id, nameAr: 'أدوات كهربائية', isActive: false });
    const beforeCycle = await db
      .select()
      .from(actionLogs)
      .where(eq(actionLogs.createdBy, actor.email));
    await expect(
      updateCategoryThroughCanonicalWorkflow(db, parent.id!, { parentId: child.id }, actor),
    ).rejects.toBeInstanceOf(CategoryHierarchyError);
    expect(await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email))).toEqual(
      beforeCycle,
    );
    expect(
      (await db.select().from(categories).where(eq(categories.id, parent.id!)))[0]!.parentId,
    ).toBeNull();

    await deleteBrandThroughCanonicalWorkflow(db, brand.id!, actor);
    await deleteCategoryThroughCanonicalWorkflow(db, child.id!, actor);
    expect((await db.select().from(products).where(eq(products.id, product!.id)))[0]).toMatchObject(
      { brandId: null, categoryId: null },
    );
    const audits = await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    expect(audits).toContainEqual(
      expect.objectContaining({
        entityType: 'categories',
        entityId: child.id,
        operation: 'delete',
        beforeState: expect.objectContaining({
          taxonomyRelations: { productIds: [product!.id], childIds: [] },
        }),
      }),
    );
    for (const action of [
      () => updateBrandThroughCanonicalWorkflow(db, brand.id!, { status: 'draft' }, actor),
      () => deleteBrandThroughCanonicalWorkflow(db, brand.id!, actor),
      () => updateCategoryThroughCanonicalWorkflow(db, child.id!, { nameAr: 'مفقود' }, actor),
      () => deleteCategoryThroughCanonicalWorkflow(db, child.id!, actor),
    ])
      await expect(action()).rejects.toBeInstanceOf(ActionHistoryEntityNotFoundError);
    expect(await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email))).toEqual(
      audits,
    );
  } finally {
    await db.delete(products).where(eq(products.id, product!.id));
    await db.delete(categories).where(inArray(categories.id, [child.id!, parent.id!]));
    await db.delete(brands).where(eq(brands.id, brand.id!));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
  }
});
