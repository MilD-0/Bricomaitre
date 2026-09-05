import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { startProductCatalogFeedRefreshJob } from './background-jobs';
import {
  archiveProductThroughCanonicalWorkflow,
  createProductThroughCanonicalWorkflow,
  ProductMutationNotFoundError,
  readProductMutationPayload,
  replaceProductThroughCanonicalWorkflow,
  restoreProductThroughCanonicalWorkflow,
  type ProductMutationActor,
} from './product-update-workflow';
import { loadArchivedProductsByIds, loadArchivedProductsPage } from './product-archive';
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

export const adminAiProductCreateSchema = z.object({ product: productPayloadSchema }).strict();

export const adminAiProductArchiveSchema = z
  .object({ productIds: z.array(z.number().int().positive()).min(1).max(20) })
  .strict();

export const adminAiArchivedProductInspectionSchema = z.discriminatedUnion('scope', [
  z
    .object({
      scope: z.literal('exact'),
      productIds: z.array(z.number().int().positive()).min(1).max(100),
    })
    .strict(),
  z
    .object({
      scope: z.literal('filtered'),
      query: z.string().trim().max(200).default(''),
      page: z.number().int().positive().default(1),
      limit: z.number().int().min(1).max(100).default(50),
    })
    .strict(),
]);

export const adminAiProductRestoreSchema = z
  .object({ productIds: z.array(z.number().int().positive()).min(1).max(20) })
  .strict();

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

async function refreshAdminAiProductSurfaces(input: {
  trigger: string;
  productIds: number[];
  revalidateLandingPages?: boolean;
}) {
  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await Promise.all([
    revalidateStorefrontProducts(),
    ...(input.revalidateLandingPages ? [revalidateStorefrontLandingPages()] : []),
  ]);
  try {
    await startProductCatalogFeedRefreshJob(input.trigger, getRequestId());
    return 'queued' as const;
  } catch (error) {
    captureAdminException(error, {
      requestId: getRequestId(),
      operation: 'product-catalog-feed-enqueue',
      route: '/api/ai/chat',
      context: { trigger: input.trigger, productIds: input.productIds },
    });
    return 'unavailable' as const;
  }
}

export async function createAdminAiProduct(
  rawInput: z.input<typeof adminAiProductCreateSchema>,
  actor: ProductMutationActor,
) {
  const input = adminAiProductCreateSchema.parse(rawInput);
  try {
    const created = await createProductThroughCanonicalWorkflow(getDb(), input.product, actor);
    const catalogFeedRefresh = await refreshAdminAiProductSurfaces({
      trigger: 'product:ai-create',
      productIds: [created.id],
    });
    return { ok: true, created, catalogFeedRefresh };
  } catch (error) {
    return { ok: false, error: failureDetails(error) };
  }
}

export async function archiveAdminAiProducts(
  rawInput: z.input<typeof adminAiProductArchiveSchema>,
  actor: ProductMutationActor,
) {
  const input = adminAiProductArchiveSchema.parse(rawInput);
  const archived = [];
  const failed = [];
  for (const productId of [...new Set(input.productIds)]) {
    try {
      archived.push(await archiveProductThroughCanonicalWorkflow(getDb(), productId, actor));
    } catch (error) {
      failed.push({
        productId,
        ...(error instanceof ProductMutationNotFoundError
          ? { code: 'product_not_found', message: error.message }
          : failureDetails(error)),
      });
    }
  }
  const catalogFeedRefresh = archived.length
    ? await refreshAdminAiProductSurfaces({
        trigger: 'product:ai-archive',
        productIds: archived.map((item) => item.id),
        revalidateLandingPages: true,
      })
    : ('not-needed' as const);
  return {
    ok: failed.length === 0,
    requestedCount: input.productIds.length,
    archivedCount: archived.length,
    failedCount: failed.length,
    catalogFeedRefresh,
    archived,
    failed,
  };
}

export async function inspectAdminAiArchivedProducts(
  rawInput: z.input<typeof adminAiArchivedProductInspectionSchema>,
) {
  const input = adminAiArchivedProductInspectionSchema.parse(rawInput);
  if (input.scope === 'exact') {
    const requestedIds = [...new Set(input.productIds)];
    const items = await loadArchivedProductsByIds(getDb(), requestedIds);
    const byId = new Map(items.map((item) => [item.id, item]));
    return {
      kind: 'archived_products' as const,
      scope: input.scope,
      requestedCount: requestedIds.length,
      items: requestedIds.flatMap((productId) => {
        const product = byId.get(productId);
        return product ? [product] : [];
      }),
      missingProductIds: requestedIds.filter((productId) => !byId.has(productId)),
    };
  }

  const result = await loadArchivedProductsPage(getDb(), {
    page: input.page,
    limit: input.limit,
    search: input.query,
  });
  return {
    kind: 'archived_products' as const,
    scope: input.scope,
    query: input.query,
    ...result,
  };
}

export async function restoreAdminAiProducts(
  rawInput: z.input<typeof adminAiProductRestoreSchema>,
  actor: ProductMutationActor,
) {
  const input = adminAiProductRestoreSchema.parse(rawInput);
  const restored = [];
  const failed = [];
  for (const productId of [...new Set(input.productIds)]) {
    try {
      restored.push(await restoreProductThroughCanonicalWorkflow(getDb(), productId, actor));
    } catch (error) {
      failed.push({
        productId,
        ...(error instanceof ProductMutationNotFoundError
          ? { code: 'archived_product_not_found', message: error.message }
          : failureDetails(error)),
      });
    }
  }
  const catalogFeedRefresh = restored.length
    ? await refreshAdminAiProductSurfaces({
        trigger: 'product:ai-restore',
        productIds: restored.map((item) => item.id),
        revalidateLandingPages: true,
      })
    : ('not-needed' as const);
  return {
    ok: failed.length === 0,
    requestedCount: input.productIds.length,
    restoredCount: restored.length,
    failedCount: failed.length,
    catalogFeedRefresh,
    restored,
    failed,
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
    catalogFeedRefresh = await refreshAdminAiProductSurfaces({
      trigger: 'product:ai-update',
      productIds: updated.map((item) => item.id),
      revalidateLandingPages: true,
    });
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
