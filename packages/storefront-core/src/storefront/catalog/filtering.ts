import {
  categories,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  featuredProductGroupProducts,
  featuredProductGroups,
  products,
} from '@bric/db/schema';
import { and, asc, desc, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import type { StorefrontProductListQuery } from '../contracts';
import { buildCatalogSearchCondition, buildCatalogSearchRelevance } from './search';

export function buildRecommendedProductOrderBy(search = '') {
  const featuredGroupRank = sql<number>`coalesce((
    select min(${featuredProductGroups.sortOrder})
    from ${featuredProductGroups}
    where ${featuredProductGroups.active} = true
      and ${featuredProductGroups.prioritizeRecommendations} = true
      and (
        exists (
          select 1
          from ${featuredProductGroupProducts}
          where ${featuredProductGroupProducts.groupId} = ${featuredProductGroups.id}
            and ${featuredProductGroupProducts.productId} = ${products.id}
        )
        or (${products.brandId} is not null and exists (
          select 1
          from ${featuredProductGroupBrands}
          where ${featuredProductGroupBrands.groupId} = ${featuredProductGroups.id}
            and ${featuredProductGroupBrands.brandId} = ${products.brandId}
        ))
        or (${products.categoryId} is not null and exists (
          select 1
          from ${featuredProductGroupCategories}
          where ${featuredProductGroupCategories.groupId} = ${featuredProductGroups.id}
            and ${featuredProductGroupCategories.categoryId} = ${products.categoryId}
        ))
      )
  ), 2147483647)`;

  const searchRelevance = buildCatalogSearchRelevance(search);

  return [
    ...(searchRelevance ? [desc(searchRelevance)] : []),
    asc(featuredGroupRank),
    desc(products.inStock),
    desc(products.unitsSold),
    desc(products.updatedAt),
    desc(products.id),
  ];
}

export function buildStorefrontProductWhereClause(query: StorefrontProductListQuery) {
  return and(
    eq(products.active, true),
    isNull(products.archivedAt),
    query.id === null ? undefined : eq(products.id, query.id),
    query.mongoId ? eq(products.mongoId, query.mongoId) : undefined,
    query.slug ? eq(products.slug, query.slug) : undefined,
    query.search ? buildCatalogSearchCondition(query.search) : undefined,
    query.brandId === null ? undefined : eq(products.brandId, query.brandId),
    query.categoryId === null
      ? undefined
      : sql`${products.categoryId} in (
          with recursive category_tree as (
            select ${categories.id} from ${categories} where ${categories.id} = ${query.categoryId}
            union all
            select child.${sql.identifier('id')}
            from ${categories} child
            inner join category_tree parent on child.${sql.identifier('parent_id')} = parent.${sql.identifier('id')}
          )
          select ${sql.identifier('id')} from category_tree
        )`,
    query.minPrice === null ? undefined : gte(products.price, query.minPrice.toFixed(2)),
    query.maxPrice === null ? undefined : lte(products.price, query.maxPrice.toFixed(2)),
    query.stock === 'in'
      ? eq(products.inStock, true)
      : query.stock === 'out'
        ? eq(products.inStock, false)
        : undefined,
    query.discounted
      ? and(sql`${products.oldPrice} is not null`, gt(products.oldPrice, products.price))
      : undefined,
  );
}
