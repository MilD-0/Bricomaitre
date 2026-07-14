import { z } from 'zod';

import type { Locale } from '@/i18n/config';

export const CATALOG_PAGE_SIZE = 24;
export const SIMILAR_PRODUCTS_PAGE_SIZE = 6;
export const catalogSortValues = ['newest', 'price-asc', 'price-desc', 'name-asc'] as const;
const catalogSortMap = {
  newest: { sortKey: 'updatedAt', sortDirection: 'desc' },
  'price-asc': { sortKey: 'price', sortDirection: 'asc' },
  'price-desc': { sortKey: 'price', sortDirection: 'desc' },
  'name-asc': { sortKey: 'title', sortDirection: 'asc' },
} as const;

function firstValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

const searchSchema = z.preprocess(firstValue, z.string().trim().max(80)).catch('');
const filterIdSchema = z.preprocess(
  firstValue,
  z.union([z.coerce.number().int().positive(), z.literal(''), z.null(), z.undefined()])
    .transform((value) => value === '' || value == null ? null : value),
).catch(null);
const sortSchema = z.preprocess(firstValue, z.enum(catalogSortValues)).catch('newest');
const pageSchema = z.preprocess(firstValue, z.coerce.number().int().positive().max(1_000)).catch(1);
const batchSizeSchema = z.coerce.number().int().min(1).max(CATALOG_PAGE_SIZE).catch(CATALOG_PAGE_SIZE);

export const catalogPageQuerySchema = z.object({
  q: searchSchema.default(''),
  category: filterIdSchema.default(null),
  brand: filterIdSchema.default(null),
  sort: sortSchema.default('newest'),
  page: pageSchema.default(1),
});

export type CatalogPageQuery = z.infer<typeof catalogPageQuerySchema>;
export type CatalogSearchParams = Record<string, string | string[] | undefined>;

export function parseCatalogPageQuery(value: CatalogSearchParams = {}) {
  return catalogPageQuerySchema.parse(value);
}

export function parseCatalogBatchSize(value: unknown) {
  return batchSizeSchema.parse(firstValue(value));
}

export function toStorefrontCatalogQuery(query: CatalogPageQuery) {
  const sort = catalogSortMap[query.sort];

  return {
    page: query.page,
    limit: CATALOG_PAGE_SIZE,
    search: query.q,
    categoryId: query.category,
    brandId: query.brand,
    id: null,
    mongoId: null,
    slug: null,
    ...sort,
  };
}

export function buildCatalogPath(locale: Locale, query: CatalogPageQuery, page = query.page) {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.category !== null) params.set('category', String(query.category));
  if (query.brand !== null) params.set('brand', String(query.brand));
  if (query.sort !== 'newest') params.set('sort', query.sort);
  if (page > 1) params.set('page', String(page));
  const serialized = params.toString();
  return `/${locale}/products${serialized ? `?${serialized}` : ''}`;
}

export function buildCatalogApiPath(query: CatalogPageQuery, page: number, batchSize = CATALOG_PAGE_SIZE) {
  const publicPath = buildCatalogPath('fr', query, page);
  const queryIndex = publicPath.indexOf('?');
  const params = new URLSearchParams(queryIndex === -1 ? `page=${page}` : publicPath.slice(queryIndex + 1));
  if (batchSize !== CATALOG_PAGE_SIZE) params.set('limit', String(parseCatalogBatchSize(batchSize)));
  return `/api/catalog?${params.toString()}`;
}

export function isFilteredCatalog(query: CatalogPageQuery) {
  return Boolean(query.q || query.category || query.brand || query.sort !== 'newest' || query.page > 1);
}
