import { getDb } from '@bric/db/client';
import { z } from 'zod';
import { reportingDateSchema as dateSchema } from '../analytics/contract';

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

export const assignmentFilterSchema = z
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
  ids: z.array(z.number().int().positive()).max(50).default([]),
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
  'Query brands by exact IDs or broader filters, with exact totals, current and archived product assignment facts, and sorting.';

export const ADMIN_AI_FIND_CATEGORIES_TOOL_DESCRIPTION =
  'Query categories by exact IDs or broader filters, with exact totals, direct product assignments, ancestors, children, and descendant catalog scope.';

export type Database = ReturnType<typeof getDb>;
