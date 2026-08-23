import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { startProductCatalogFeedRefreshJob } from './background-jobs';
import {
  readProductMutationPayload,
  replaceProductThroughCanonicalWorkflow,
  type ProductMutationActor,
} from './product-update-workflow';
import { productPayloadSchema, productPromoCodePayloadSchema } from './products';
import { captureAdminException, getRequestId } from './sentry';
import { CACHE_TAGS, revalidateServerTags } from './server-cache';
import {
  revalidateStorefrontLandingPages,
  revalidateStorefrontProducts,
} from './storefront-revalidate';

const nullableTextChange = z.string().trim().nullable();
const nullableIdentifierChange = z
  .string()
  .trim()
  .nullable()
  .transform((value) => value || null);

export const adminAiProductChangesSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    slug: z.string().trim().min(1).max(180).nullable().optional(),
    titleAr: nullableTextChange.optional(),
    description: nullableTextChange.optional(),
    descriptionAr: nullableTextChange.optional(),
    sku: nullableIdentifierChange.optional(),
    barcode: nullableIdentifierChange.optional(),
    price: z.number().nonnegative().optional(),
    oldPrice: z.number().nonnegative().nullable().optional(),
    purchasePrice: z.number().nonnegative().nullable().optional(),
    active: z.boolean().optional(),
    inStock: z.boolean().optional(),
    availabilityStatus: z.enum(['in_stock', 'out_of_stock']).optional(),
    brandId: z.number().int().positive().nullable().optional(),
    categoryId: z.number().int().positive().nullable().optional(),
    images: z.array(z.string().trim().url()).max(24).optional(),
    promoCodes: z.array(productPromoCodePayloadSchema).max(20).optional(),
  })
  .strict()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'At least one product field must change.',
  });

export const adminAiProductUpdateSchema = z.object({
  items: z
    .array(
      z.strictObject({
        productId: z.number().int().positive(),
        changes: adminAiProductChangesSchema,
      }),
    )
    .min(1)
    .max(20),
});

function mergedProductPayload(
  current: Awaited<ReturnType<typeof readProductMutationPayload>>,
  changes: z.output<typeof adminAiProductChangesSchema>,
) {
  const merged = { ...current, ...changes };
  if (changes.inStock !== undefined && changes.availabilityStatus === undefined) {
    merged.availabilityStatus = changes.inStock ? 'in_stock' : 'out_of_stock';
  }
  if (changes.availabilityStatus !== undefined && changes.inStock === undefined) {
    merged.inStock = changes.availabilityStatus === 'in_stock';
  }
  return productPayloadSchema.parse(merged);
}

function failureDetails(error: unknown) {
  if (error instanceof z.ZodError) {
    return {
      code: 'invalid_product_update',
      message: 'The requested product update conflicts with the canonical product rules.',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    };
  }
  return {
    code: error instanceof Error ? error.name : 'ProductUpdateError',
    message: error instanceof Error ? error.message : 'Unable to update product.',
  };
}

export async function updateAdminAiProducts(
  rawInput: z.input<typeof adminAiProductUpdateSchema>,
  actor: ProductMutationActor,
) {
  const input = adminAiProductUpdateSchema.parse(rawInput);
  const db = getDb();
  const updated = [];
  const failed = [];

  for (const item of input.items) {
    try {
      const current = await readProductMutationPayload(db, item.productId);
      const changes = adminAiProductChangesSchema.parse(item.changes);
      const next = mergedProductPayload(current, changes);
      const result = await replaceProductThroughCanonicalWorkflow(db, item.productId, next, actor);
      updated.push({
        ...result,
        changedFields: Object.keys(changes),
        previous: Object.fromEntries(
          Object.keys(changes).map((field) => [field, current[field as keyof typeof current]]),
        ),
      });
    } catch (error) {
      failed.push({ productId: item.productId, ...failureDetails(error) });
    }
  }

  let catalogFeedRefresh: 'queued' | 'unavailable' | 'not-needed' = 'not-needed';
  if (updated.length > 0) {
    revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
    await Promise.all([revalidateStorefrontProducts(), revalidateStorefrontLandingPages()]);
    try {
      await startProductCatalogFeedRefreshJob('product:ai-update', getRequestId());
      catalogFeedRefresh = 'queued';
    } catch (error) {
      catalogFeedRefresh = 'unavailable';
      captureAdminException(error, {
        requestId: getRequestId(),
        operation: 'product-catalog-feed-enqueue',
        route: '/api/ai/chat',
        context: { trigger: 'product:ai-update', productIds: updated.map((item) => item.id) },
      });
    }
  }

  return {
    ok: failed.length === 0,
    requestedCount: input.items.length,
    updatedCount: updated.length,
    failedCount: failed.length,
    catalogFeedRefresh,
    updated,
    failed,
  };
}
