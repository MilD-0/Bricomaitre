import { and, asc, count, desc, eq, ilike, inArray, isNull, ne } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import {
  type BrandRow,
  type BrandsListResponse,
  type CategoryRow,
  type CategoriesListResponse,
  paginationQuerySchema,
} from './brands-categories';
import { resolveUniqueSlug } from './slug';

type PaginationQuery = ReturnType<typeof paginationQuerySchema.parse>;

type BrandRecord = typeof brands.$inferSelect;
type CategoryRecord = typeof categories.$inferSelect;
type ParentOption = CategoriesListResponse['parentOptions'][number];

function toBrandRow(row: BrandRecord, productCount = 0): BrandRow {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    image: row.image ?? null,
    isActive: row.isActive,
    status: row.isActive ? 'active' : 'draft',
    productCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy ?? null,
    createdByName: row.createdByName ?? null,
    updatedBy: row.updatedBy ?? null,
    updatedByName: row.updatedByName ?? null,
  };
}

function toCategoryRow(
  row: CategoryRecord,
  parentName: string | null,
  productCount = 0,
): CategoryRow {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.slug,
    nameAr: row.nameAr ?? null,
    image: row.image ?? null,
    isActive: row.isActive,
    status: row.isActive ? 'active' : 'draft',
    parentId: row.parentId ? String(row.parentId) : null,
    parentName,
    productCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy ?? null,
    createdByName: row.createdByName ?? null,
    updatedBy: row.updatedBy ?? null,
    updatedByName: row.updatedByName ?? null,
  };
}

async function resolveTaxonomySlug(
  entityType: 'brands' | 'categories',
  value: string,
  currentId?: number,
) {
  const db = getDb();
  const table = entityType === 'brands' ? brands : categories;

  return resolveUniqueSlug(value, async (slug) => {
    const [existing] = await db
      .select({ id: table.id })
      .from(table)
      .where(
        currentId == null
          ? eq(table.slug, slug)
          : and(eq(table.slug, slug), ne(table.id, currentId)),
      )
      .limit(1);

    return Boolean(existing);
  });
}

export function resolveBrandSlug(value: string, currentId?: number) {
  return resolveTaxonomySlug('brands', value, currentId);
}

export function resolveCategorySlug(value: string, currentId?: number) {
  return resolveTaxonomySlug('categories', value, currentId);
}

export async function readBrandsPage(
  query: PaginationQuery,
): Promise<Pick<BrandsListResponse, 'items' | 'pagination'>> {
  const searchFilter = query.search ? ilike(brands.name, `%${query.search}%`) : undefined;
  const [{ value: totalItems }] = await getDb()
    .select({ value: count() })
    .from(brands)
    .where(searchFilter);
  const rows = await getDb()
    .select()
    .from(brands)
    .where(searchFilter)
    .orderBy(desc(brands.updatedAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  const ids = rows.map((row) => row.id);
  const productCounts =
    ids.length === 0
      ? []
      : await getDb()
          .select({ id: products.brandId, value: count() })
          .from(products)
          .where(and(inArray(products.brandId, ids), isNull(products.archivedAt)))
          .groupBy(products.brandId);
  const countsById = new Map(productCounts.map((row) => [row.id, Number(row.value)]));
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));

  return {
    items: rows.map((row) => toBrandRow(row, countsById.get(row.id) ?? 0)),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    },
  };
}

export async function readBrand(id: number) {
  const [row] = await getDb().select().from(brands).where(eq(brands.id, id)).limit(1);

  return row ? toBrandRow(row) : null;
}

export async function readCategoriesPage(
  query: PaginationQuery,
  includeParentOptions: boolean,
): Promise<Pick<CategoriesListResponse, 'items' | 'parentOptions' | 'pagination'>> {
  const searchFilter = query.search ? ilike(categories.name, `%${query.search}%`) : undefined;
  const [{ value: totalItems }] = await getDb()
    .select({ value: count() })
    .from(categories)
    .where(searchFilter);
  const rows = await getDb()
    .select()
    .from(categories)
    .where(searchFilter)
    .orderBy(desc(categories.updatedAt))
    .limit(query.limit)
    .offset((query.page - 1) * query.limit);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const parentIds = [
    ...new Set(
      rows.map((row) => row.parentId).filter((value): value is number => typeof value === 'number'),
    ),
  ];
  const parentRows =
    parentIds.length === 0
      ? []
      : await getDb()
          .select({ id: categories.id, name: categories.name })
          .from(categories)
          .where(inArray(categories.id, parentIds));
  const parentNames = new Map(parentRows.map((row) => [row.id, row.name]));
  const ids = rows.map((row) => row.id);
  const productCounts =
    ids.length === 0
      ? []
      : await getDb()
          .select({ id: products.categoryId, value: count() })
          .from(products)
          .where(and(inArray(products.categoryId, ids), isNull(products.archivedAt)))
          .groupBy(products.categoryId);
  const countsById = new Map(productCounts.map((row) => [row.id, Number(row.value)]));
  const parentOptions: ParentOption[] = includeParentOptions
    ? await getDb()
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .orderBy(asc(categories.name))
        .then((options) => options.map((option) => ({ id: String(option.id), name: option.name })))
    : [];

  return {
    items: rows.map((row) =>
      toCategoryRow(
        row,
        row.parentId ? (parentNames.get(row.parentId) ?? null) : null,
        countsById.get(row.id) ?? 0,
      ),
    ),
    parentOptions,
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: query.page < totalPages,
      hasPreviousPage: query.page > 1,
    },
  };
}

export async function readCategory(id: number) {
  const [row] = await getDb().select().from(categories).where(eq(categories.id, id)).limit(1);

  if (!row) {
    return null;
  }

  const parentRow = row.parentId
    ? await getDb()
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.id, row.parentId))
        .limit(1)
        .then((results) => results[0] ?? null)
    : null;

  return toCategoryRow(row, parentRow?.name ?? null);
}
