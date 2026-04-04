import 'dotenv/config';

import { asc, eq } from 'drizzle-orm';

import { getDb, hasDb } from '../db/client';
import { brands, categories, products } from '../db/schema';
import { createSlugAssigner } from '../lib/slug';

async function main() {
  if (!hasDb()) {
    throw new Error('DATABASE_URL is required.');
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    const now = new Date();

    const brandRows = await tx
      .select({ id: brands.id, name: brands.name, slug: brands.slug })
      .from(brands)
      .orderBy(asc(brands.id));
    const assignBrandSlug = createSlugAssigner();
    let updatedBrands = 0;

    for (const row of brandRows) {
      const nextSlug = assignBrandSlug(row.name);
      if (row.slug === nextSlug) {
        continue;
      }

      await tx.update(brands).set({ slug: nextSlug, updatedAt: now }).where(eq(brands.id, row.id));
      updatedBrands += 1;
    }

    const categoryRows = await tx
      .select({ id: categories.id, name: categories.name, slug: categories.slug })
      .from(categories)
      .orderBy(asc(categories.id));
    const assignCategorySlug = createSlugAssigner();
    let updatedCategories = 0;

    for (const row of categoryRows) {
      const nextSlug = assignCategorySlug(row.name);
      if (row.slug === nextSlug) {
        continue;
      }

      await tx.update(categories).set({ slug: nextSlug, updatedAt: now }).where(eq(categories.id, row.id));
      updatedCategories += 1;
    }

    const productRows = await tx
      .select({ id: products.id, title: products.title, slug: products.slug })
      .from(products)
      .orderBy(asc(products.id));
    const assignProductSlug = createSlugAssigner();
    let updatedProducts = 0;

    for (const row of productRows) {
      const nextSlug = assignProductSlug(row.title);
      if (row.slug === nextSlug) {
        continue;
      }

      await tx.update(products).set({ slug: nextSlug, updatedAt: now }).where(eq(products.id, row.id));
      updatedProducts += 1;
    }

    console.log(`Updated brand slugs: ${updatedBrands}`);
    console.log(`Updated category slugs: ${updatedCategories}`);
    console.log(`Updated product slugs: ${updatedProducts}`);
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
