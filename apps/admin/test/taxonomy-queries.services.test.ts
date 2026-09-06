import { getDb, getPool } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';

import { readBrandsPage, readCategoriesPage } from '../lib/brands-categories-api';

afterAll(async () => {
  await getPool().end();
});

it('sorts taxonomy globally before pagination and searches slugs, counting only live products', async () => {
  const db = getDb();
  const marker = randomUUID();
  const values = ['Z', 'A', 'M'].map((prefix, index) => ({
    name: `${prefix} ${marker}`,
    slug: `slug-only-${index}-${marker}`,
    updatedAt: new Date(`2026-01-0${[2, 1, 3][index]}T00:00:00.000Z`),
  }));
  const brandRows = await db.insert(brands).values(values).returning();
  const categoryRows = await db.insert(categories).values(values).returning();
  const productRows = await db
    .insert(products)
    .values([
      ...Array.from({ length: 3 }, (_, index) => ({
        title: 'Live',
        slug: `${marker}-${index}`,
        price: '100',
        brandId: brandRows[0]!.id,
        categoryId: categoryRows[0]!.id,
      })),
      {
        title: 'Live',
        slug: `${marker}-other`,
        price: '100',
        brandId: brandRows[1]!.id,
        categoryId: categoryRows[1]!.id,
      },
      ...Array.from({ length: 5 }, (_, index) => ({
        title: 'Archived',
        slug: `${marker}-archived-${index}`,
        price: '100',
        brandId: brandRows[2]!.id,
        categoryId: categoryRows[2]!.id,
        archivedAt: new Date(),
      })),
    ])
    .returning({ id: products.id });
  try {
    for (const read of [
      readBrandsPage,
      (query: Parameters<typeof readCategoriesPage>[0]) => readCategoriesPage(query, false),
    ]) {
      for (const [sort, expected] of [
        ['updated', ['M', 'Z', 'A']],
        ['name', ['A', 'M', 'Z']],
        ['products', ['Z', 'A', 'M']],
      ] as const) {
        const pages = await Promise.all(
          [1, 2, 3].map((page) => read({ page, limit: 1, search: marker, sort })),
        );
        expect(pages.map((page) => page.items[0]!.name)).toEqual(
          expected.map((prefix) => `${prefix} ${marker}`),
        );
        expect(pages[0]!.pagination).toMatchObject({
          totalItems: 3,
          totalPages: 3,
          hasNextPage: true,
        });
        expect(pages[2]!.pagination).toMatchObject({ hasNextPage: false, hasPreviousPage: true });
        if (sort === 'products')
          expect(pages.map((page) => page.items[0]!.productCount)).toEqual([3, 1, 0]);
      }
      const slugMatch = await read({
        page: 1,
        limit: 50,
        search: `slug-only-1-${marker}`,
        sort: 'name',
      });
      expect(slugMatch.items.map((row) => row.name)).toEqual([`A ${marker}`]);
      expect(slugMatch.pagination.totalItems).toBe(1);
    }
  } finally {
    await db.delete(products).where(
      inArray(
        products.id,
        productRows.map((row) => row.id),
      ),
    );
    await db.delete(categories).where(
      inArray(
        categories.id,
        categoryRows.map((row) => row.id),
      ),
    );
    await db.delete(brands).where(
      inArray(
        brands.id,
        brandRows.map((row) => row.id),
      ),
    );
  }
});
