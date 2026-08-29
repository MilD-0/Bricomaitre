import {
  createProductCategorizationClassifier,
  PRODUCT_CATEGORIZATION_PROMPT_VERSION,
  type ProductCategorizationClassifier,
} from '@bric/ai-core';
import { and, asc, count, eq, gt, inArray, isNull } from 'drizzle-orm';
import { startOwnedJob } from '@bric/runtime/jobs';

import { getDb } from '@bric/db/client';
import { aiProposals, brands, categories, products } from '@bric/db/schema';
import { createAdminAiLandingPage, editAdminAiLandingPage } from './admin-ai-landing-pages';
import { proposeProductContent, reviewProductContentProposal } from './ai-product-content';
import {
  proposeProductCategoryAssignment,
  reviewProductCategoryProposal,
} from './ai-product-category-proposals';
import {
  ADMIN_AI_CATEGORIZATION_QUEUE,
  ADMIN_AI_CONTENT_QUEUE,
  ADMIN_AI_LANDING_PAGE_QUEUE,
  type AiCategorizationPayload,
  type AiContentPayload,
  type AiLandingPagePayload,
  type QueueJobMeta,
  assistantJobOrigin,
  toClientJob,
} from './background-job-contract';
import { startProductCatalogFeedRefreshJob } from './background-jobs-commerce';
import { CACHE_TAGS, revalidateServerTags } from './server-cache';
import { revalidateStorefrontProducts } from './storefront-revalidate';

export * from './background-job-contract';
export * from './background-jobs-commerce';

export async function refreshAppliedAiProposalConsumers(trigger = 'ai-product-content:apply') {
  try {
    revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  } catch (error) {
    console.warn('[admin] local product cache invalidation failed after proposal application', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await Promise.allSettled([
    revalidateStorefrontProducts(),
    startProductCatalogFeedRefreshJob(trigger),
  ]);
}
export async function startAiContentJob(
  ownerKey: string,
  payload: Omit<AiContentPayload, keyof QueueJobMeta>,
  requestId?: string,
) {
  const result = await startOwnedJob<AiContentPayload>({
    queueName: ADMIN_AI_CONTENT_QUEUE,
    kind: 'ai-product-content',
    ownerKey,
    origin: assistantJobOrigin(payload),
    conversationId: payload.conversationId,
    requestId,
    data: payload as AiContentPayload,
  });
  return { kind: result.kind, job: toClientJob(result.job) };
}

type AiContentProduct = {
  id: number;
  title: string;
  titleAr: string | null;
  description: string | null;
  descriptionAr: string | null;
};

export type AiContentJobDependencies = {
  listProducts: (payload: AiContentPayload) => Promise<AiContentProduct[]>;
  listPendingProductIds: () => Promise<Set<number>>;
  propose: (input: {
    productId: number;
    fields: AiContentPayload['fields'];
    context?: string;
    actorId?: string | null;
  }) => Promise<{ id: number }>;
  applyProposal: (
    proposalId: number,
    actor: AiContentPayload['actor'],
  ) => Promise<{ status: 'applied'; verified: true }>;
  refreshConsumers: (trigger: string) => Promise<void>;
};

function createAiContentJobDependencies(): AiContentJobDependencies {
  return {
    listProducts: async (payload) =>
      getDb()
        .select({
          id: products.id,
          title: products.title,
          titleAr: products.titleAr,
          description: products.description,
          descriptionAr: products.descriptionAr,
        })
        .from(products)
        .where(
          and(
            eq(products.active, true),
            payload.productIds?.length ? inArray(products.id, payload.productIds) : undefined,
          ),
        )
        .orderBy(asc(products.id)),
    listPendingProductIds: async () =>
      new Set(
        (
          await getDb()
            .select({ id: aiProposals.entityId })
            .from(aiProposals)
            .where(
              and(
                eq(aiProposals.proposalType, 'product_content'),
                eq(aiProposals.entityType, 'products'),
                eq(aiProposals.status, 'proposed'),
                gt(aiProposals.expiresAt, new Date()),
              ),
            )
        ).flatMap((row) => (row.id === null ? [] : [row.id])),
      ),
    propose: async (input) =>
      proposeProductContent({
        productId: input.productId,
        fields: input.fields,
        adminContext: input.context,
        actorId: input.actorId,
      }),
    applyProposal: async (proposalId, actor) => {
      const result = await reviewProductContentProposal({
        proposalId,
        action: 'approve',
        actor,
      });
      if (result.status !== 'applied' || result.verified !== true) {
        throw new Error('Product content proposal application was not verified.');
      }
      return result;
    },
    refreshConsumers: refreshAppliedAiProposalConsumers,
  };
}

export async function runAiContentJob(
  payload: AiContentPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
  dependencies: AiContentJobDependencies = createAiContentJobDependencies(),
) {
  const rows = await dependencies.listProducts(payload);
  const pendingProductIds = await dependencies.listPendingProductIds();
  const counters = {
    processed: 0,
    proposed: 0,
    applied: 0,
    autoApplyFailed: 0,
    skipped: 0,
    alreadyProposed: 0,
    failed: 0,
  };
  const failures: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    await helpers.throwIfCancelled();
    const product = rows[index];
    const fields = payload.onlyMissing
      ? payload.fields.filter((field) => !product[field]?.trim())
      : payload.fields;
    if (pendingProductIds.has(product.id)) {
      counters.alreadyProposed += 1;
    } else if (fields.length === 0) {
      counters.skipped += 1;
    } else {
      try {
        const proposal = await dependencies.propose({
          productId: product.id,
          fields,
          context: payload.context,
          actorId: payload.actor.email,
        });
        pendingProductIds.add(product.id);
        if (payload.autoApply) {
          try {
            await dependencies.applyProposal(proposal.id, payload.actor);
            counters.applied += 1;
          } catch {
            counters.proposed += 1;
            counters.autoApplyFailed += 1;
          }
        } else {
          counters.proposed += 1;
        }
      } catch {
        counters.failed += 1;
        failures.push(product.id);
      }
    }
    counters.processed += 1;
    await helpers.updateProgress({
      phase: 'generating-proposals',
      current: counters.processed,
      total: rows.length,
    });
    await helpers.updateSummary({ ...counters, total: rows.length });
  }
  const accounted =
    counters.proposed +
    counters.applied +
    counters.skipped +
    counters.alreadyProposed +
    counters.failed;
  const summary = {
    ...counters,
    total: rows.length,
    accounted,
    complete: counters.processed === rows.length && accounted === rows.length,
    failedProductIds: failures.slice(0, 100),
  };
  if (counters.applied > 0) {
    await dependencies.refreshConsumers('ai-product-content:auto-apply');
  }
  await helpers.updateSummary(summary);
  if (!summary.complete) {
    throw new Error(
      `Product content generation stopped after ${counters.processed} of ${rows.length} products.`,
    );
  }
  return summary;
}

export async function startAiCategorizationJob(
  ownerKey: string,
  payload: Omit<AiCategorizationPayload, keyof QueueJobMeta>,
  requestId?: string,
) {
  const result = await startOwnedJob<AiCategorizationPayload>({
    queueName: ADMIN_AI_CATEGORIZATION_QUEUE,
    kind: 'ai-product-categorization',
    ownerKey,
    origin: assistantJobOrigin(payload),
    conversationId: payload.conversationId,
    requestId,
    activeScope: 'global',
    data: payload as AiCategorizationPayload,
  });
  return { kind: result.kind, job: toClientJob(result.job) };
}

type CategorizationProduct = {
  id: number;
  title: string;
  description: string | null;
  sku: string | null;
  brand: string | null;
  categoryId: number | null;
  category: string | null;
};
type CategorizationCategory = {
  id: number;
  name: string;
  nameAr: string | null;
  parentId: number | null;
  parentName: string | null;
};

export type AiCategorizationDependencies = {
  classifier: ProductCategorizationClassifier;
  listCategories: () => Promise<CategorizationCategory[]>;
  countProducts: (scope: AiCategorizationPayload['scope']) => Promise<number>;
  listProductsAfter: (
    scope: AiCategorizationPayload['scope'],
    lastId: number,
    limit: number,
  ) => Promise<CategorizationProduct[]>;
  listPendingProductIds: () => Promise<Set<number>>;
  proposeCategory: (input: {
    productId: number;
    categoryId: number;
    reasoning: string;
    model: string;
    usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
    actorId?: string | null;
  }) => Promise<{ id: number }>;
  applyProposal: (proposalId: number, actor: AiCategorizationPayload['actor']) => Promise<unknown>;
  refreshConsumers: (trigger: string) => Promise<void>;
};

function createAiCategorizationDependencies(): AiCategorizationDependencies {
  const db = getDb();
  return {
    classifier: createProductCategorizationClassifier(),
    async listCategories() {
      const rows = await db
        .select({
          id: categories.id,
          name: categories.name,
          nameAr: categories.nameAr,
          parentId: categories.parentId,
        })
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.id));
      const names = new Map(rows.map((row) => [row.id, row.name]));
      return rows.map((row) => ({
        ...row,
        parentName: row.parentId ? (names.get(row.parentId) ?? null) : null,
      }));
    },
    async countProducts(scope) {
      const [{ value }] = await db
        .select({ value: count() })
        .from(products)
        .where(
          and(
            eq(products.active, true),
            scope === 'uncategorized' ? isNull(products.categoryId) : undefined,
          ),
        );
      return value;
    },
    listProductsAfter: (scope, lastId, limit) =>
      db
        .select({
          id: products.id,
          title: products.title,
          description: products.description,
          sku: products.sku,
          brand: brands.name,
          categoryId: products.categoryId,
          category: categories.name,
        })
        .from(products)
        .leftJoin(brands, eq(products.brandId, brands.id))
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(products.active, true),
            scope === 'uncategorized' ? isNull(products.categoryId) : undefined,
            gt(products.id, lastId),
          ),
        )
        .orderBy(asc(products.id))
        .limit(limit),
    async listPendingProductIds() {
      const rows = await db
        .select({ entityId: aiProposals.entityId })
        .from(aiProposals)
        .where(
          and(
            eq(aiProposals.entityType, 'products'),
            eq(aiProposals.proposalType, 'product_category'),
            eq(aiProposals.status, 'proposed'),
            gt(aiProposals.expiresAt, new Date()),
          ),
        );
      return new Set(rows.map((row) => row.entityId));
    },
    proposeCategory: (input) =>
      proposeProductCategoryAssignment({
        productId: input.productId,
        categoryId: input.categoryId,
        actorId: input.actorId,
        reasoning: input.reasoning,
        model: input.model,
        promptVersion: PRODUCT_CATEGORIZATION_PROMPT_VERSION,
        usage: input.usage,
      }),
    applyProposal: async (proposalId, actor) => {
      const result = await reviewProductCategoryProposal({
        proposalId,
        action: 'approve',
        actorId: actor.email,
        actorName: actor.name,
      });
      return result;
    },
    refreshConsumers: refreshAppliedAiProposalConsumers,
  };
}

export async function runAiCategorizationJob(
  payload: AiCategorizationPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
  dependencies: AiCategorizationDependencies = createAiCategorizationDependencies(),
) {
  const categories = await dependencies.listCategories();
  if (categories.length === 0)
    throw new Error('No active categories are available for catalog categorization.');
  const categoryIds = new Set(categories.map((category) => category.id));
  const total = await dependencies.countProducts(payload.scope);
  const pendingProductIds = await dependencies.listPendingProductIds();
  const counters = {
    processed: 0,
    proposed: 0,
    applied: 0,
    autoApplyFailed: 0,
    unchanged: 0,
    ambiguous: 0,
    alreadyProposed: 0,
    failed: 0,
  };
  const ambiguousProductIds: number[] = [];
  const failedProductIds: number[] = [];
  let lastId = 0;

  while (counters.processed < total) {
    await helpers.throwIfCancelled();
    const page = await dependencies.listProductsAfter(payload.scope, lastId, payload.batchSize);
    if (page.length === 0) break;
    for (const product of page) {
      await helpers.throwIfCancelled();
      lastId = product.id;
      if (pendingProductIds.has(product.id)) {
        counters.alreadyProposed += 1;
      } else {
        try {
          const result = await dependencies.classifier.classify({
            product: {
              id: product.id,
              title: product.title,
              description: product.description?.slice(0, 12_000) ?? null,
              brand: product.brand,
              sku: product.sku,
              currentCategoryId: product.categoryId,
              currentCategory: product.category,
            },
            categories,
            adminContext: payload.context,
          });
          const decision = result.decision;
          if (
            decision.ambiguous ||
            decision.categoryId === null ||
            !categoryIds.has(decision.categoryId) ||
            decision.confidence < payload.confidenceThreshold
          ) {
            counters.ambiguous += 1;
            if (ambiguousProductIds.length < 100) ambiguousProductIds.push(product.id);
          } else if (decision.categoryId === product.categoryId) {
            counters.unchanged += 1;
          } else {
            const proposal = await dependencies.proposeCategory({
              productId: product.id,
              categoryId: decision.categoryId,
              reasoning: `${decision.reasoning} Confidence: ${(decision.confidence * 100).toFixed(1)}%.`,
              model: result.model,
              usage: result.usage,
              actorId: payload.actor.email,
            });
            pendingProductIds.add(product.id);
            if (payload.autoApply) {
              try {
                await dependencies.applyProposal(proposal.id, payload.actor);
                counters.applied += 1;
              } catch {
                counters.proposed += 1;
                counters.autoApplyFailed += 1;
              }
            } else {
              counters.proposed += 1;
            }
          }
        } catch {
          counters.failed += 1;
          if (failedProductIds.length < 100) failedProductIds.push(product.id);
        }
      }
      counters.processed += 1;
      await helpers.updateProgress({
        phase: 'classifying-products',
        current: counters.processed,
        total,
      });
    }
    await helpers.updateSummary({ ...counters, total, lastProductId: lastId });
  }

  const accounted =
    counters.proposed +
    counters.applied +
    counters.unchanged +
    counters.ambiguous +
    counters.alreadyProposed +
    counters.failed;
  const summary = {
    ...counters,
    total,
    accounted,
    complete: counters.processed === total && accounted === total,
    lastProductId: lastId,
    ambiguousProductIds,
    failedProductIds,
  };
  if (counters.applied > 0) {
    await dependencies.refreshConsumers('ai-product-categorization:auto-apply');
  }
  await helpers.updateSummary(summary);
  if (!summary.complete)
    throw new Error(
      `Catalog categorization stopped after ${counters.processed} of ${total} products.`,
    );
  return summary;
}

export async function startAiLandingPageJob(
  ownerKey: string,
  payload: Omit<AiLandingPagePayload, keyof QueueJobMeta>,
  requestId?: string,
) {
  const result = await startOwnedJob<AiLandingPagePayload>({
    queueName: ADMIN_AI_LANDING_PAGE_QUEUE,
    kind: `ai-landing-page:${payload.work.operation}`,
    ownerKey,
    origin: assistantJobOrigin(payload),
    conversationId: payload.conversationId,
    requestId,
    data: payload as AiLandingPagePayload,
  });
  return { kind: result.kind, job: toClientJob(result.job) };
}

export type AiLandingPageJobDependencies = {
  create: typeof createAdminAiLandingPage;
  revise: typeof editAdminAiLandingPage;
};

const aiLandingPageJobDependencies: AiLandingPageJobDependencies = {
  create: createAdminAiLandingPage,
  revise: editAdminAiLandingPage,
};

function landingPageJobSummary(
  operation: AiLandingPagePayload['work']['operation'],
  result: Awaited<ReturnType<typeof createAdminAiLandingPage>>,
) {
  const stages = result.generation.stages as {
    status?: string;
    failures?: unknown[];
    [key: string]: unknown;
  } | null;
  return {
    operation,
    complete: stages?.status === 'completed',
    partial: stages?.status === 'partial-fallback',
    landingPageId: result.id,
    productId: result.productId,
    locale: result.locale,
    slug: result.slug,
    active: result.active,
    currentRevision: result.currentRevision,
    generation: {
      model: result.generation.model,
      stages,
      groundingNotes: result.generation.groundingNotes,
    },
  };
}

export async function runAiLandingPageJob(
  payload: AiLandingPagePayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
  dependencies: AiLandingPageJobDependencies = aiLandingPageJobDependencies,
) {
  await helpers.throwIfCancelled();
  await helpers.updateProgress({ phase: 'generating', current: 0, total: 1 });
  const result =
    payload.work.operation === 'create'
      ? await dependencies.create(
          {
            productId: payload.work.productId,
            locale: payload.work.locale,
            creativeBrief: payload.work.creativeBrief,
            active: payload.work.publish,
          },
          payload.actor,
        )
      : await dependencies.revise(
          {
            landingPageId: payload.work.landingPageId,
            expectedRevision: payload.work.expectedRevision,
            instruction: payload.work.instruction,
            targetBlockIds: payload.work.targetBlockIds,
            deleteBlockIds: payload.work.deleteBlockIds,
            allowStructuralChanges: payload.work.allowStructuralChanges,
            active:
              payload.work.publication === 'preserve'
                ? null
                : payload.work.publication === 'publish',
          },
          payload.actor,
        );
  const summary = landingPageJobSummary(payload.work.operation, result);
  await helpers.updateProgress({ phase: 'completed', current: 1, total: 1 });
  await helpers.updateSummary(summary);
  return summary;
}
