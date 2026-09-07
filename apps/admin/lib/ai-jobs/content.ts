import { getDb } from '@bric/db/client';
import { aiProposals, products } from '@bric/db/schema';
import { startOwnedJob } from '@bric/runtime/jobs';
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { proposeProductContent, reviewProductContentProposal } from '../ai-product-content';
import {
  ADMIN_AI_CONTENT_QUEUE,
  type AiContentPayload,
  type QueueJobMeta,
  assistantJobOrigin,
  toClientJob,
} from '../background-job-contract';
import { refreshAppliedAiProposalConsumers } from './refresh';

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
  listPendingProductIds: (fields: AiContentPayload['fields']) => Promise<Set<number>>;
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
    listPendingProductIds: async (fields) =>
      new Set(
        (
          await getDb()
            .select({ id: aiProposals.entityId })
            .from(aiProposals)
            .innerJoin(products, eq(products.id, aiProposals.entityId))
            .where(
              and(
                eq(aiProposals.proposalType, 'product_content'),
                eq(aiProposals.sourceUpdatedAt, products.updatedAt),
                ...fields.map((field) => sql`${aiProposals.payload}->'changes' ? ${field}`),
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
  const pendingProductIds = await dependencies.listPendingProductIds(payload.fields);
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
  try {
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
  } finally {
    if (counters.applied > 0) await dependencies.refreshConsumers('ai-product-content:auto-apply');
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
  await helpers.updateSummary(summary);
  if (!summary.complete) {
    throw new Error(
      `Product content generation stopped after ${counters.processed} of ${rows.length} products.`,
    );
  }
  return summary;
}
