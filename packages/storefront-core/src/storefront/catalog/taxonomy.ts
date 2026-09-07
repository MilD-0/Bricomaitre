import { brands, categories, products } from '@bric/db/schema';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { toStorefrontBrandDto, toStorefrontCategoryDto } from '../dto';
import { type Database } from './selection';

export async function readStorefrontBrands(db: Database) {
  const rows = await db
    .select({
      id: brands.id,
      name: brands.name,
      slug: brands.slug,
      image: brands.image,
      featured: brands.featured,
      createdAt: brands.createdAt,
      updatedAt: brands.updatedAt,
    })
    .from(brands)
    .where(eq(brands.isActive, true))
    .orderBy(asc(brands.name));

  return rows.map(toStorefrontBrandDto);
}

export async function readStorefrontCategories(db: Database) {
  const [rows, directProductCounts] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        nameEn: categories.nameEn,
        nameAr: categories.nameAr,
        image: categories.image,
        parentId: categories.parentId,
        properties: categories.properties,
        featured: categories.featured,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.name)),
    db
      .select({ categoryId: products.categoryId, count: count() })
      .from(products)
      .where(
        and(
          eq(products.active, true),
          isNull(products.archivedAt),
          sql`${products.categoryId} is not null`,
        ),
      )
      .groupBy(products.categoryId),
  ]);

  const directCounts = new Map(
    directProductCounts.map((row) => [row.categoryId, Number(row.count)]),
  );
  const children = new Map<number, number[]>();
  for (const row of rows) {
    if (row.parentId == null) continue;
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  }
  const countWithDescendants = (categoryId: number, seen = new Set<number>()): number => {
    if (seen.has(categoryId)) return 0;
    seen.add(categoryId);
    return (
      (directCounts.get(categoryId) ?? 0) +
      (children.get(categoryId) ?? []).reduce(
        (sum, childId) => sum + countWithDescendants(childId, new Set(seen)),
        0,
      )
    );
  };

  return rows.map((row) => ({
    ...toStorefrontCategoryDto(row),
    productCount: countWithDescendants(row.id),
  }));
}

export async function readStorefrontCatalogCounts(db: Database) {
  const productWhereClause = buildCatalogCountProductVisibilityCondition();
  const brandWhereClause = eq(brands.isActive, true);
  const categoryWhereClause = eq(categories.isActive, true);

  const [productRows, brandRows, categoryRows] = await Promise.all([
    db.select({ count: count() }).from(products).where(productWhereClause),
    db.select({ count: count() }).from(brands).where(brandWhereClause),
    db.select({ count: count() }).from(categories).where(categoryWhereClause),
  ]);

  return {
    productCount: Number(productRows[0]?.count ?? 0),
    brandCount: Number(brandRows[0]?.count ?? 0),
    categoryCount: Number(categoryRows[0]?.count ?? 0),
  };
}

/**
 * The release preflight starts the candidate API before applying pending
 * migrations. Read the archive marker through the row JSON so this one probe
 * works both before migration 0071 creates products.archived_at and after the
 * modern catalog starts using it. Missing and null archive markers are both
 * visible; archived products remain excluded once the column exists.
 */
export function buildCatalogCountProductVisibilityCondition() {
  return and(
    eq(products.active, true),
    sql<boolean>`(to_jsonb(${products}) ->> 'archived_at') is null`,
  );
}
