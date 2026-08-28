import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { brands, categories, productPromoCodes, products } from '@bric/db/schema';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const directionSchema = z.enum(['asc', 'desc']);

export const adminAiCatalogQuerySchema = z
  .object({
    query: z.string().trim().max(200).default(''),
    archive: z.enum(['current', 'archived', 'all']).default('current'),
    productState: z.enum(['any', 'active', 'inactive']).default('any'),
    stockState: z.enum(['any', 'in_stock', 'out_of_stock']).default('any'),
    inventoryMin: z.number().int().nullable().default(null),
    inventoryMax: z.number().int().nullable().default(null),
    brandIds: z.array(z.number().int().positive()).max(50).default([]),
    categoryIds: z.array(z.number().int().positive()).max(50).default([]),
    includeCategoryDescendants: z.boolean().default(true),
    promotion: z.enum(['any', 'none', 'active', 'not_started', 'ended', 'disabled']).default('any'),
    promoEndsFrom: dateSchema.nullable().default(null),
    promoEndsThrough: dateSchema.nullable().default(null),
    sortBy: z
      .enum([
        'title',
        'price',
        'purchasePrice',
        'inventoryQuantity',
        'promotionEnd',
        'updatedAt',
        'archivedAt',
      ])
      .default('updatedAt'),
    sortDirection: directionSchema.default('desc'),
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.inventoryMin !== null &&
      input.inventoryMax !== null &&
      input.inventoryMin > input.inventoryMax
    ) {
      context.addIssue({
        code: 'custom',
        path: ['inventoryMax'],
        message: 'inventoryMax must be greater than or equal to inventoryMin.',
      });
    }
    if (
      input.promoEndsFrom !== null &&
      input.promoEndsThrough !== null &&
      input.promoEndsFrom > input.promoEndsThrough
    ) {
      context.addIssue({
        code: 'custom',
        path: ['promoEndsThrough'],
        message: 'promoEndsThrough must be on or after promoEndsFrom.',
      });
    }
  });

const assignmentFilterSchema = z
  .enum([
    'any',
    'assigned',
    'unassigned',
    'with_active_products',
    'without_active_products',
    'with_archived_products',
  ])
  .default('any');

const taxonomyBaseSchema = {
  query: z.string().trim().max(200).default(''),
  state: z.enum(['any', 'active', 'inactive']).default('any'),
  assignment: assignmentFilterSchema,
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
};

export const adminAiBrandQuerySchema = z
  .object({
    ...taxonomyBaseSchema,
    sortBy: z.enum(['name', 'updatedAt', 'currentProducts', 'activeProducts']).default('name'),
    sortDirection: directionSchema.default('asc'),
  })
  .strict();

export const adminAiCategoryQuerySchema = z
  .object({
    ...taxonomyBaseSchema,
    level: z.enum(['any', 'root', 'child']).default('any'),
    parentIds: z.array(z.number().int().positive()).max(50).default([]),
    sortBy: z
      .enum([
        'name',
        'updatedAt',
        'directCurrentProducts',
        'directActiveProducts',
        'catalogScopeActiveProducts',
        'childCount',
      ])
      .describe(
        'For a parent category’s total active-product size, use catalogScopeActiveProducts (the category and all descendants). The directActiveProducts and directCurrentProducts sorts rank only products assigned to that exact category.',
      )
      .default('name'),
    sortDirection: directionSchema.default('asc'),
  })
  .strict();

export const ADMIN_AI_QUERY_PRODUCTS_TOOL_DESCRIPTION =
  'Query the catalog or inventory exhaustively with filters, sorting, exact totals, taxonomy, and promotion dates. Use this for cohorts and rankings; use inspect_products for full details of exact current IDs.';

export const ADMIN_AI_FIND_BRANDS_TOOL_DESCRIPTION =
  'Query brands with exact totals, current and archived product assignment facts, and sorting.';

export const ADMIN_AI_FIND_CATEGORIES_TOOL_DESCRIPTION =
  'Query categories with exact totals, direct product assignments, ancestors, children, and descendant catalog scope.';

type Database = ReturnType<typeof getDb>;

function startOfDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDate(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

async function resolveCategoryScope(
  database: Database,
  categoryIds: number[],
  includeDescendants: boolean,
) {
  if (!includeDescendants || categoryIds.length === 0) return categoryIds;
  const rows = await database
    .select({ id: categories.id, parentId: categories.parentId })
    .from(categories);
  const selected = new Set(categoryIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parentId !== null && selected.has(row.parentId) && !selected.has(row.id)) {
        selected.add(row.id);
        changed = true;
      }
    }
  }
  return [...selected];
}

function promotionRowFilters(input: z.output<typeof adminAiCatalogQuerySchema>, now: Date) {
  return [
    {
      any: undefined,
      none: undefined,
      active: and(
        eq(productPromoCodes.active, true),
        or(isNull(productPromoCodes.startsAt), lte(productPromoCodes.startsAt, now)),
        or(isNull(productPromoCodes.endsAt), gte(productPromoCodes.endsAt, now)),
      ),
      not_started: and(eq(productPromoCodes.active, true), gt(productPromoCodes.startsAt, now)),
      ended: lt(productPromoCodes.endsAt, now),
      disabled: eq(productPromoCodes.active, false),
    }[input.promotion],
    input.promoEndsFrom
      ? gte(productPromoCodes.endsAt, startOfDate(input.promoEndsFrom))
      : undefined,
    input.promoEndsThrough
      ? lte(productPromoCodes.endsAt, endOfDate(input.promoEndsThrough))
      : undefined,
  ].filter((filter) => filter !== undefined);
}

function promotionFilter(input: z.output<typeof adminAiCatalogQuerySchema>, now: Date) {
  if (input.promotion === 'none') {
    return sql`not exists (
      select 1 from ${productPromoCodes}
      where ${productPromoCodes.productId} = ${products.id}
    )`;
  }
  const rowFilters = promotionRowFilters(input, now);
  if (rowFilters.length === 0) return undefined;
  return sql`exists (
    select 1 from ${productPromoCodes}
    where ${productPromoCodes.productId} = ${products.id}
      and ${and(...rowFilters)}
  )`;
}

export async function queryAdminCatalogProducts(
  raw: z.input<typeof adminAiCatalogQuerySchema>,
  database: Database = getDb(),
  now = new Date(),
) {
  const input = adminAiCatalogQuerySchema.parse(raw);
  const categoryIds = await resolveCategoryScope(
    database,
    input.categoryIds,
    input.includeCategoryDescendants,
  );
  const filters = [
    input.archive === 'current'
      ? isNull(products.archivedAt)
      : input.archive === 'archived'
        ? isNotNull(products.archivedAt)
        : undefined,
    input.query
      ? or(
          ilike(products.title, `%${input.query}%`),
          ilike(products.sku, `%${input.query}%`),
          ilike(products.barcode, `%${input.query}%`),
        )
      : undefined,
    input.productState === 'any' ? undefined : eq(products.active, input.productState === 'active'),
    input.stockState === 'any' ? undefined : eq(products.inStock, input.stockState === 'in_stock'),
    input.inventoryMin === null ? undefined : gte(products.inventoryQuantity, input.inventoryMin),
    input.inventoryMax === null ? undefined : lte(products.inventoryQuantity, input.inventoryMax),
    input.brandIds.length > 0 ? inArray(products.brandId, input.brandIds) : undefined,
    categoryIds.length > 0 ? inArray(products.categoryId, categoryIds) : undefined,
    promotionFilter(input, now),
  ].filter((filter) => filter !== undefined);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const [{ value: totalItems = 0 } = { value: 0 }] = await database
    .select({ value: count() })
    .from(products)
    .where(where);
  const total = Number(totalItems);
  const totalPages = Math.max(1, Math.ceil(total / input.limit));
  const page = Math.min(input.page, totalPages);
  const promotionEndFilters = promotionRowFilters(input, now);
  const sortColumn = {
    title: products.title,
    price: products.price,
    purchasePrice: products.purchasePrice,
    inventoryQuantity: products.inventoryQuantity,
    promotionEnd: sql<Date | null>`(
      select min(${productPromoCodes.endsAt})
      from ${productPromoCodes}
      where ${productPromoCodes.productId} = ${products.id}
        ${promotionEndFilters.length > 0 ? sql`and ${and(...promotionEndFilters)}` : sql``}
    )`,
    updatedAt: products.updatedAt,
    archivedAt: products.archivedAt,
  }[input.sortBy];
  const direction = input.sortDirection === 'asc' ? asc : desc;
  const rows = await database
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      barcode: products.barcode,
      price: products.price,
      oldPrice: products.oldPrice,
      purchasePrice: products.purchasePrice,
      active: products.active,
      inStock: products.inStock,
      availabilityStatus: products.availabilityStatus,
      inventoryQuantity: products.inventoryQuantity,
      brandId: products.brandId,
      brandName: brands.name,
      categoryId: products.categoryId,
      categoryName: categories.name,
      archivedAt: products.archivedAt,
      updatedAt: products.updatedAt,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(direction(sortColumn), desc(products.id))
    .limit(input.limit)
    .offset((page - 1) * input.limit);
  const productIds = rows.map((row) => row.id);
  const promoRows =
    productIds.length === 0
      ? []
      : await database
          .select({
            productId: productPromoCodes.productId,
            code: productPromoCodes.code,
            promoPrice: productPromoCodes.promoPrice,
            active: productPromoCodes.active,
            startsAt: productPromoCodes.startsAt,
            endsAt: productPromoCodes.endsAt,
          })
          .from(productPromoCodes)
          .where(inArray(productPromoCodes.productId, productIds))
          .orderBy(asc(productPromoCodes.endsAt), asc(productPromoCodes.code));
  const promosByProduct = new Map<number, typeof promoRows>();
  for (const promo of promoRows) {
    promosByProduct.set(promo.productId, [...(promosByProduct.get(promo.productId) ?? []), promo]);
  }

  return {
    kind: 'catalog_query' as const,
    asOf: now.toISOString(),
    filters: input,
    categoryScopeIds: categoryIds,
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      sku: row.sku,
      barcode: row.barcode,
      lifecycle: {
        archivedAt: row.archivedAt?.toISOString() ?? null,
        active: row.active,
        inStock: row.inStock,
        status: row.availabilityStatus,
      },
      inventoryQuantity: row.inventoryQuantity,
      pricing: {
        priceDzd: Number(row.price),
        oldPriceDzd: row.oldPrice === null ? null : Number(row.oldPrice),
        purchasePriceDzd: row.purchasePrice === null ? null : Number(row.purchasePrice),
      },
      taxonomy: {
        brand: row.brandId ? { id: row.brandId, name: row.brandName } : null,
        category: row.categoryId ? { id: row.categoryId, name: row.categoryName } : null,
      },
      promotions: (promosByProduct.get(row.id) ?? []).map((promo) => ({
        code: promo.code,
        promoPriceDzd: Number(promo.promoPrice),
        active: promo.active,
        startsAt: promo.startsAt?.toISOString() ?? null,
        endsAt: promo.endsAt?.toISOString() ?? null,
      })),
      updatedAt: row.updatedAt.toISOString(),
    })),
    pagination: {
      page,
      limit: input.limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

type AssignmentFacts = {
  currentProducts: number;
  archivedProducts: number;
  activeProducts: number;
  inactiveProducts: number;
  inStockProducts: number;
  outOfStockProducts: number;
};

function emptyAssignmentFacts(): AssignmentFacts {
  return {
    currentProducts: 0,
    archivedProducts: 0,
    activeProducts: 0,
    inactiveProducts: 0,
    inStockProducts: 0,
    outOfStockProducts: 0,
  };
}

function addProduct(facts: AssignmentFacts, product: ProductAssignmentRow) {
  if (product.archivedAt) {
    facts.archivedProducts += 1;
    return;
  }
  facts.currentProducts += 1;
  facts[product.active ? 'activeProducts' : 'inactiveProducts'] += 1;
  facts[product.inStock ? 'inStockProducts' : 'outOfStockProducts'] += 1;
}

function addFacts(target: AssignmentFacts, source: AssignmentFacts) {
  for (const key of Object.keys(target) as Array<keyof AssignmentFacts>) target[key] += source[key];
}

function matchesAssignment(
  facts: AssignmentFacts,
  filter: z.output<typeof assignmentFilterSchema>,
) {
  return {
    any: true,
    assigned: facts.currentProducts > 0,
    unassigned: facts.currentProducts === 0,
    with_active_products: facts.activeProducts > 0,
    without_active_products: facts.activeProducts === 0,
    with_archived_products: facts.archivedProducts > 0,
  }[filter];
}

function paginate<T>(items: T[], pageInput: number, limit: number) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const page = Math.min(pageInput, totalPages);
  return {
    items: items.slice((page - 1) * limit, page * limit),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

type ProductAssignmentRow = {
  brandId: number | null;
  categoryId: number | null;
  archivedAt: Date | null;
  active: boolean;
  inStock: boolean;
};

async function loadProductAssignments(database: Database): Promise<ProductAssignmentRow[]> {
  return database
    .select({
      brandId: products.brandId,
      categoryId: products.categoryId,
      archivedAt: products.archivedAt,
      active: products.active,
      inStock: products.inStock,
    })
    .from(products);
}

function compareValues(left: string | number | Date, right: string | number | Date) {
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === 'string' && typeof right === 'string') return left.localeCompare(right);
  return Number(left) - Number(right);
}

export async function queryAdminBrands(
  raw: z.input<typeof adminAiBrandQuerySchema>,
  database: Database = getDb(),
) {
  const input = adminAiBrandQuerySchema.parse(raw);
  const [brandRows, productRows] = await Promise.all([
    database.select().from(brands),
    loadProductAssignments(database),
  ]);
  const factsById = new Map<number, AssignmentFacts>();
  for (const product of productRows) {
    if (product.brandId === null) continue;
    const facts = factsById.get(product.brandId) ?? emptyAssignmentFacts();
    addProduct(facts, product);
    factsById.set(product.brandId, facts);
  }
  const direction = input.sortDirection === 'asc' ? 1 : -1;
  const matches = brandRows
    .map((brand) => ({ brand, assignments: factsById.get(brand.id) ?? emptyAssignmentFacts() }))
    .filter(
      ({ brand, assignments }) =>
        (!input.query ||
          [brand.name, brand.slug].some((value) =>
            value.toLocaleLowerCase().includes(input.query.toLocaleLowerCase()),
          )) &&
        (input.state === 'any' || brand.isActive === (input.state === 'active')) &&
        matchesAssignment(assignments, input.assignment),
    )
    .sort((left, right) => {
      const leftValue =
        input.sortBy === 'name'
          ? left.brand.name
          : input.sortBy === 'updatedAt'
            ? left.brand.updatedAt
            : left.assignments[input.sortBy];
      const rightValue =
        input.sortBy === 'name'
          ? right.brand.name
          : input.sortBy === 'updatedAt'
            ? right.brand.updatedAt
            : right.assignments[input.sortBy];
      return compareValues(leftValue, rightValue) * direction || right.brand.id - left.brand.id;
    });
  const result = paginate(matches, input.page, input.limit);
  return {
    kind: 'brand_query' as const,
    filters: input,
    items: result.items.map(({ brand, assignments }) => ({
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
      active: brand.isActive,
      featured: brand.featured,
      assignments,
      updatedAt: brand.updatedAt.toISOString(),
    })),
    pagination: result.pagination,
  };
}

export async function queryAdminCategories(
  raw: z.input<typeof adminAiCategoryQuerySchema>,
  database: Database = getDb(),
) {
  const input = adminAiCategoryQuerySchema.parse(raw);
  const [categoryRows, productRows] = await Promise.all([
    database.select().from(categories),
    loadProductAssignments(database),
  ]);
  const byId = new Map(categoryRows.map((category) => [category.id, category]));
  const children = new Map<number, number[]>();
  for (const category of categoryRows) {
    if (category.parentId === null) continue;
    children.set(category.parentId, [...(children.get(category.parentId) ?? []), category.id]);
  }
  const directFacts = new Map<number, AssignmentFacts>();
  for (const product of productRows) {
    if (product.categoryId === null) continue;
    const facts = directFacts.get(product.categoryId) ?? emptyAssignmentFacts();
    addProduct(facts, product);
    directFacts.set(product.categoryId, facts);
  }
  const descendantIds = (categoryId: number, seen = new Set<number>()): number[] => {
    if (seen.has(categoryId)) return [];
    seen.add(categoryId);
    return (children.get(categoryId) ?? []).flatMap((childId) => [
      childId,
      ...descendantIds(childId, new Set(seen)),
    ]);
  };
  const ancestors = (categoryId: number) => {
    const result: Array<{ id: number; name: string }> = [];
    const seen = new Set<number>([categoryId]);
    let parentId = byId.get(categoryId)?.parentId ?? null;
    while (parentId !== null && !seen.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      result.unshift({ id: parent.id, name: parent.name });
      seen.add(parentId);
      parentId = parent.parentId;
    }
    return result;
  };
  const enriched = categoryRows.map((category) => {
    const descendants = descendantIds(category.id);
    const assignments = directFacts.get(category.id) ?? emptyAssignmentFacts();
    const catalogScopeAssignments = emptyAssignmentFacts();
    for (const categoryId of [category.id, ...descendants]) {
      addFacts(catalogScopeAssignments, directFacts.get(categoryId) ?? emptyAssignmentFacts());
    }
    return { category, descendants, assignments, catalogScopeAssignments };
  });
  const direction = input.sortDirection === 'asc' ? 1 : -1;
  const query = input.query.toLocaleLowerCase();
  const matches = enriched
    .filter(
      ({ category, assignments }) =>
        (!query ||
          [category.name, category.nameEn, category.nameAr, category.slug].some((value) =>
            value?.toLocaleLowerCase().includes(query),
          )) &&
        (input.state === 'any' || category.isActive === (input.state === 'active')) &&
        (input.level === 'any' ||
          (input.level === 'root' ? category.parentId === null : category.parentId !== null)) &&
        (input.parentIds.length === 0 ||
          (category.parentId !== null && input.parentIds.includes(category.parentId))) &&
        matchesAssignment(assignments, input.assignment),
    )
    .sort((left, right) => {
      const leftValue =
        input.sortBy === 'name'
          ? left.category.name
          : input.sortBy === 'updatedAt'
            ? left.category.updatedAt
            : input.sortBy === 'childCount'
              ? (children.get(left.category.id)?.length ?? 0)
              : input.sortBy === 'catalogScopeActiveProducts'
                ? left.catalogScopeAssignments.activeProducts
                : input.sortBy === 'directActiveProducts'
                  ? left.assignments.activeProducts
                  : left.assignments.currentProducts;
      const rightValue =
        input.sortBy === 'name'
          ? right.category.name
          : input.sortBy === 'updatedAt'
            ? right.category.updatedAt
            : input.sortBy === 'childCount'
              ? (children.get(right.category.id)?.length ?? 0)
              : input.sortBy === 'catalogScopeActiveProducts'
                ? right.catalogScopeAssignments.activeProducts
                : input.sortBy === 'directActiveProducts'
                  ? right.assignments.activeProducts
                  : right.assignments.currentProducts;
      return (
        compareValues(leftValue, rightValue) * direction || right.category.id - left.category.id
      );
    });
  const result = paginate(matches, input.page, input.limit);
  return {
    kind: 'category_query' as const,
    filters: input,
    items: result.items.map(({ category, descendants, assignments, catalogScopeAssignments }) => {
      const parent = category.parentId === null ? null : byId.get(category.parentId);
      return {
        id: category.id,
        name: category.name,
        nameEn: category.nameEn,
        nameAr: category.nameAr,
        slug: category.slug,
        active: category.isActive,
        featured: category.featured,
        assignments,
        hierarchy: {
          parent: parent ? { id: parent.id, name: parent.name } : null,
          ancestors: ancestors(category.id),
          directChildren: (children.get(category.id) ?? []).flatMap((childId) => {
            const child = byId.get(childId);
            return child ? [{ id: child.id, name: child.name, active: child.isActive }] : [];
          }),
          directChildCount: children.get(category.id)?.length ?? 0,
          descendantCount: descendants.length,
        },
        catalogScopeAssignments,
        updatedAt: category.updatedAt.toISOString(),
      };
    }),
    pagination: result.pagination,
  };
}
