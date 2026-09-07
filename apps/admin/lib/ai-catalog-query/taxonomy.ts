import { getDb } from '@bric/db/client';
import { brands, categories, products } from '@bric/db/schema';
import { z } from 'zod';
import {
  adminAiBrandQuerySchema,
  adminAiCategoryQuerySchema,
  assignmentFilterSchema,
  type Database,
} from './contract';

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
        (input.ids.length === 0 || input.ids.includes(brand.id)) &&
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
        (input.ids.length === 0 || input.ids.includes(category.id)) &&
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
