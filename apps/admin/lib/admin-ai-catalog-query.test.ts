import { describe, expect, it, vi } from 'vitest';

import {
  adminAiCatalogQuerySchema,
  queryAdminBrands,
  queryAdminCatalogProducts,
  queryAdminCategories,
} from './admin-ai-catalog-query';

function queryResult<T>(rows: T[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ['from', 'where', 'leftJoin', 'orderBy', 'limit', 'offset']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: T[]) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

function databaseWithSelects(...results: unknown[][]) {
  const select = vi.fn(() => queryResult(results.shift() ?? []));
  return { select } as never;
}

describe('Admin assistant broad catalog evidence', () => {
  it('validates useful cohort boundaries without requiring a search phrase', () => {
    expect(
      adminAiCatalogQuerySchema.parse({
        inventoryMax: 0,
        promotion: 'active',
        sortBy: 'inventoryQuantity',
      }),
    ).toMatchObject({
      query: '',
      archive: 'current',
      inventoryMax: 0,
      promotion: 'active',
      sortBy: 'inventoryQuantity',
    });
    expect(adminAiCatalogQuerySchema.safeParse({ inventoryMin: 10, inventoryMax: 2 }).success).toBe(
      false,
    );
    expect(
      adminAiCatalogQuerySchema.safeParse({
        promoEndsFrom: '2026-09-01',
        promoEndsThrough: '2026-08-01',
      }).success,
    ).toBe(false);
  });

  it('returns exact totals and compact product, inventory, taxonomy, and promotion facts', async () => {
    const now = new Date('2026-08-28T08:00:00.000Z');
    const database = databaseWithSelects(
      [{ value: 1 }],
      [
        {
          id: 12,
          title: 'Perceuse',
          sku: 'PER-12',
          barcode: null,
          price: '12000.00',
          oldPrice: '13000.00',
          purchasePrice: '7000.00',
          active: true,
          inStock: false,
          availabilityStatus: 'out_of_stock',
          inventoryQuantity: 0,
          brandId: 2,
          brandName: 'Bosch',
          categoryId: 3,
          categoryName: 'Perceuses',
          archivedAt: null,
          updatedAt: new Date('2026-08-27T09:00:00.000Z'),
        },
      ],
      [
        {
          productId: 12,
          code: 'PROMO',
          promoPrice: '11000.00',
          active: true,
          startsAt: null,
          endsAt: new Date('2026-08-31T23:59:59.000Z'),
        },
      ],
    );

    await expect(
      queryAdminCatalogProducts(
        { inventoryMax: 0, sortBy: 'inventoryQuantity', sortDirection: 'asc' },
        database,
        now,
      ),
    ).resolves.toMatchObject({
      kind: 'catalog_query',
      asOf: now.toISOString(),
      items: [
        {
          id: 12,
          inventoryQuantity: 0,
          lifecycle: { active: true, inStock: false, archivedAt: null },
          pricing: { priceDzd: 12_000, purchasePriceDzd: 7_000 },
          taxonomy: {
            brand: { id: 2, name: 'Bosch' },
            category: { id: 3, name: 'Perceuses' },
          },
          promotions: [{ code: 'PROMO', promoPriceDzd: 11_000 }],
        },
      ],
      pagination: { totalItems: 1, page: 1, totalPages: 1 },
    });
  });

  it('queries brands by live assignment facts while retaining archived assignments', async () => {
    const database = databaseWithSelects(
      [
        {
          id: 1,
          name: 'Assigned',
          slug: 'assigned',
          isActive: true,
          featured: false,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 2,
          name: 'Archive only',
          slug: 'archive-only',
          isActive: false,
          featured: false,
          updatedAt: new Date('2026-08-02T00:00:00.000Z'),
        },
      ],
      [
        {
          brandId: 1,
          categoryId: null,
          archivedAt: null,
          active: true,
          inStock: true,
        },
        {
          brandId: 2,
          categoryId: null,
          archivedAt: new Date('2026-08-20T00:00:00.000Z'),
          active: false,
          inStock: false,
        },
      ],
    );

    await expect(
      queryAdminBrands({ assignment: 'with_archived_products' }, database),
    ).resolves.toMatchObject({
      items: [
        {
          id: 2,
          assignments: { currentProducts: 0, archivedProducts: 1, activeProducts: 0 },
        },
      ],
      pagination: { totalItems: 1 },
    });
  });

  it('resolves exact brand and category IDs for references from other systems', async () => {
    const brandDatabase = databaseWithSelects(
      [
        {
          id: 1,
          name: 'First',
          slug: 'first',
          isActive: true,
          featured: false,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 18,
          name: 'Wadfow',
          slug: 'wadfow',
          isActive: true,
          featured: true,
          updatedAt: new Date('2026-08-02T00:00:00.000Z'),
        },
      ],
      [],
    );
    const categoryDatabase = databaseWithSelects(
      [
        {
          id: 60,
          name: 'Outillage à Main',
          nameEn: 'Hand Tools',
          nameAr: 'أدوات يدوية',
          slug: 'outillage-main',
          isActive: true,
          featured: false,
          parentId: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 61,
          name: 'Other',
          nameEn: 'Other',
          nameAr: null,
          slug: 'other',
          isActive: true,
          featured: false,
          parentId: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      [],
    );

    await expect(queryAdminBrands({ ids: [18] }, brandDatabase)).resolves.toMatchObject({
      filters: { ids: [18] },
      items: [{ id: 18, name: 'Wadfow' }],
      pagination: { totalItems: 1 },
    });
    await expect(queryAdminCategories({ ids: [60] }, categoryDatabase)).resolves.toMatchObject({
      filters: { ids: [60] },
      items: [{ id: 60, name: 'Outillage à Main' }],
      pagination: { totalItems: 1 },
    });
  });

  it('separates category direct assignments from descendant catalog scope', async () => {
    const database = databaseWithSelects(
      [
        {
          id: 10,
          name: 'Tools',
          nameEn: 'Tools',
          nameAr: null,
          slug: 'tools',
          isActive: true,
          featured: false,
          parentId: null,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
        {
          id: 11,
          name: 'Drills',
          nameEn: 'Drills',
          nameAr: null,
          slug: 'drills',
          isActive: true,
          featured: false,
          parentId: 10,
          updatedAt: new Date('2026-08-02T00:00:00.000Z'),
        },
      ],
      [
        {
          brandId: null,
          categoryId: 11,
          archivedAt: null,
          active: true,
          inStock: true,
        },
      ],
    );

    await expect(queryAdminCategories({ query: 'Tools' }, database)).resolves.toMatchObject({
      items: [
        {
          id: 10,
          assignments: { currentProducts: 0, activeProducts: 0 },
          hierarchy: {
            parent: null,
            directChildren: [{ id: 11, name: 'Drills', active: true }],
            directChildCount: 1,
            descendantCount: 1,
          },
          catalogScopeAssignments: { currentProducts: 1, activeProducts: 1 },
        },
      ],
    });
  });

  it('sorts categories by active products across their descendant catalog scope', async () => {
    const category = (id: number, name: string, parentId: number | null) => ({
      id,
      name,
      nameEn: name,
      nameAr: null,
      slug: name.toLocaleLowerCase(),
      isActive: true,
      featured: false,
      parentId,
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const database = databaseWithSelects(
      [
        category(10, 'Direct leader', null),
        category(20, 'Scope leader', null),
        category(21, 'Child', 20),
      ],
      [
        {
          brandId: null,
          categoryId: 10,
          archivedAt: null,
          active: true,
          inStock: true,
        },
        ...Array.from({ length: 2 }, () => ({
          brandId: null,
          categoryId: 21,
          archivedAt: null,
          active: true,
          inStock: true,
        })),
      ],
    );

    const result = await queryAdminCategories(
      {
        level: 'root',
        sortBy: 'catalogScopeActiveProducts',
        sortDirection: 'desc',
      },
      database,
    );

    expect(result.items.map((item) => item.name)).toEqual(['Scope leader', 'Direct leader']);
    expect(result.items[0]?.catalogScopeAssignments.activeProducts).toBe(2);
    expect(result.items[0]?.hierarchy.directChildCount).toBe(1);
  });
});
