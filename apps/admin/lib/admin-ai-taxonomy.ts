import { z } from 'zod';

import { getDb } from '@bric/db/client';
import type { ActionActor } from './action-history';
import { brandUpdateSchema, categoryUpdateSchema } from './brands-categories';
import { CategoryHierarchyError } from './category-hierarchy';
import { revalidateStorefrontProductMeta } from './storefront-revalidate';
import {
  brandCreateSchema,
  categoryCreateSchema,
  createBrandThroughCanonicalWorkflow,
  createCategoryThroughCanonicalWorkflow,
  deleteBrandThroughCanonicalWorkflow,
  deleteCategoryThroughCanonicalWorkflow,
  TaxonomyMutationNotFoundError,
  updateBrandThroughCanonicalWorkflow,
  updateCategoryThroughCanonicalWorkflow,
} from './taxonomy-mutations';

const nonEmptyBrandUpdateSchema = brandUpdateSchema.refine(
  (input) => Object.keys(input).length > 0,
  { message: 'At least one brand field must change.' },
);
const nonEmptyCategoryUpdateSchema = categoryUpdateSchema.refine(
  (input) => Object.keys(input).length > 0,
  { message: 'At least one category field must change.' },
);

export const adminAiTaxonomyMutationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('create'),
    entity: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('brand'), data: brandCreateSchema }),
      z.strictObject({ kind: z.literal('category'), data: categoryCreateSchema }),
    ]),
  }),
  z.strictObject({
    operation: z.literal('update'),
    entity: z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('brand'),
        id: z.number().int().positive(),
        changes: nonEmptyBrandUpdateSchema,
      }),
      z.strictObject({
        kind: z.literal('category'),
        id: z.number().int().positive(),
        changes: nonEmptyCategoryUpdateSchema,
      }),
    ]),
  }),
  z.strictObject({
    operation: z.literal('delete'),
    entity: z.strictObject({
      kind: z.enum(['brand', 'category']),
      id: z.number().int().positive(),
    }),
  }),
]);

function taxonomyFailure(error: unknown) {
  if (error instanceof TaxonomyMutationNotFoundError) {
    return { code: 'taxonomy_not_found', message: error.message };
  }
  if (error instanceof CategoryHierarchyError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: error instanceof Error ? error.name : 'TaxonomyMutationError',
    message: error instanceof Error ? error.message : 'Unable to change taxonomy.',
  };
}

export async function manageAdminAiTaxonomy(
  rawInput: z.input<typeof adminAiTaxonomyMutationSchema>,
  actor?: ActionActor,
) {
  const input = adminAiTaxonomyMutationSchema.parse(rawInput);
  const db = getDb();
  try {
    let result;
    if (input.operation === 'create') {
      result =
        input.entity.kind === 'brand'
          ? await createBrandThroughCanonicalWorkflow(db, input.entity.data, actor)
          : await createCategoryThroughCanonicalWorkflow(db, input.entity.data, actor);
    } else if (input.operation === 'update') {
      result =
        input.entity.kind === 'brand'
          ? await updateBrandThroughCanonicalWorkflow(
              db,
              input.entity.id,
              input.entity.changes,
              actor,
            )
          : await updateCategoryThroughCanonicalWorkflow(
              db,
              input.entity.id,
              input.entity.changes,
              actor,
            );
    } else {
      result =
        input.entity.kind === 'brand'
          ? await deleteBrandThroughCanonicalWorkflow(db, input.entity.id, actor)
          : await deleteCategoryThroughCanonicalWorkflow(db, input.entity.id, actor);
    }
    await revalidateStorefrontProductMeta();
    return { ok: true, operation: input.operation, result };
  } catch (error) {
    return { ok: false, operation: input.operation, error: taxonomyFailure(error) };
  }
}
