import { z } from 'zod';

import type { Locale } from '@/i18n/config';

export const CATALOG_PAGE_SIZE = 24;
export const SIMILAR_PRODUCTS_PAGE_SIZE = 6;
export const catalogSortValues = [
  'recommended',
  'newest',
  'price-asc',
  'price-desc',
  'name-asc',
] as const;
const catalogSortMap = {
  recommended: { sortKey: 'recommended', sortDirection: 'desc' },
  newest: { sortKey: 'updatedAt', sortDirection: 'desc' },
  'price-asc': { sortKey: 'price', sortDirection: 'asc' },
  'price-desc': { sortKey: 'price', sortDirection: 'desc' },
  'name-asc': { sortKey: 'title', sortDirection: 'asc' },
} as const;

function firstValue(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

const searchSchema = z.preprocess(firstValue, z.string().trim().max(80)).catch('');
const filterIdSchema = z
  .preprocess(
    firstValue,
    z
      .union([z.coerce.number().int().positive(), z.literal(''), z.null(), z.undefined()])
      .transform((value) => (value === '' || value == null ? null : value)),
  )
  .catch(null);
const sortSchema = z.preprocess(firstValue, z.enum(catalogSortValues)).catch('recommended');
const discountedSchema = z
  .preprocess(
    firstValue,
    z
      .union([
        z.literal('1'),
        z.literal('true'),
        z.literal(true),
        z.literal(false),
        z.literal(''),
        z.null(),
        z.undefined(),
      ])
      .transform((value) => value === '1' || value === 'true' || value === true),
  )
  .catch(false);
const stockSchema = z.preprocess(firstValue, z.enum(['all', 'in'])).catch('all');
const priceSchema = z
  .preprocess(
    firstValue,
    z
      .union([z.literal(''), z.null(), z.undefined(), z.coerce.number().nonnegative()])
      .transform((value) => (value === '' || value == null ? null : value)),
  )
  .catch(null);
const pageSchema = z.preprocess(firstValue, z.coerce.number().int().positive().max(1_000)).catch(1);
const batchSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(CATALOG_PAGE_SIZE)
  .catch(CATALOG_PAGE_SIZE);

const catalogPageQuerySchema = z.object({
  q: searchSchema.default(''),
  category: filterIdSchema.default(null),
  brand: filterIdSchema.default(null),
  discounted: discountedSchema.default(false),
  stock: stockSchema.default('all'),
  minPrice: priceSchema.default(null),
  maxPrice: priceSchema.default(null),
  sort: sortSchema.default('recommended'),
  page: pageSchema.default(1),
});

export type CatalogPageQuery = z.infer<typeof catalogPageQuerySchema>;
export type CatalogPageQueryInput = z.input<typeof catalogPageQuerySchema>;
export type CatalogSearchParams = Record<string, string | string[] | undefined>;

export function parseCatalogPageQuery(value: unknown = {}) {
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
    discounted: query.discounted,
    stock: query.stock,
    minPrice: query.minPrice,
    maxPrice: query.maxPrice,
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
  if (query.discounted) params.set('discounted', '1');
  if (query.stock !== 'all') params.set('stock', query.stock);
  if (query.minPrice !== null) params.set('minPrice', String(query.minPrice));
  if (query.maxPrice !== null) params.set('maxPrice', String(query.maxPrice));
  if (query.sort !== 'recommended') params.set('sort', query.sort);
  if (page > 1) params.set('page', String(page));
  const serialized = params.toString();
  return `/${locale}/products${serialized ? `?${serialized}` : ''}`;
}

export function buildCatalogApiPath(
  query: CatalogPageQuery,
  page: number,
  batchSize = CATALOG_PAGE_SIZE,
) {
  const publicPath = buildCatalogPath('fr', query, page);
  const queryIndex = publicPath.indexOf('?');
  const params = new URLSearchParams(
    queryIndex === -1 ? `page=${page}` : publicPath.slice(queryIndex + 1),
  );
  if (batchSize !== CATALOG_PAGE_SIZE)
    params.set('limit', String(parseCatalogBatchSize(batchSize)));
  return `/api/catalog?${params.toString()}`;
}

export function isFilteredCatalog(query: CatalogPageQuery) {
  return Boolean(
    query.q ||
    query.category ||
    query.brand ||
    query.discounted ||
    query.stock !== 'all' ||
    query.minPrice !== null ||
    query.maxPrice !== null ||
    query.sort !== 'recommended' ||
    query.page > 1,
  );
}
