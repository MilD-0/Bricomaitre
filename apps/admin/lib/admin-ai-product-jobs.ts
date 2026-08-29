import { productContentFieldSchema } from '@bric/ai-core';
import { z } from 'zod';

import type { ActionActor } from './action-history';
import { proposeProductContent, reviewProductContentProposal } from './ai-product-content';
import {
  ADMIN_AI_CATEGORIZATION_QUEUE,
  ADMIN_AI_CONTENT_QUEUE,
  getLatestExportJob,
  refreshAppliedAiProposalConsumers,
  startAiCategorizationJob,
  startAiContentJob,
} from './background-jobs';

const INLINE_PRODUCT_CONTENT_LIMIT = 3;

export const adminAiProductContentGenerationSchema = z
  .object({
    scope: z.enum(['explicit', 'all_missing']),
    productIds: z.array(z.number().int().positive()).max(500).default([]),
    fields: z.array(productContentFieldSchema).min(1).max(4),
    context: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((input, refinement) => {
    if (input.scope === 'explicit' && input.productIds.length === 0) {
      refinement.addIssue({
        code: 'custom',
        path: ['productIds'],
        message: 'Explicit product content generation requires exact product IDs.',
      });
    }
    if (input.scope === 'all_missing' && input.productIds.length > 0) {
      refinement.addIssue({
        code: 'custom',
        path: ['productIds'],
        message: 'The all_missing scope resolves the current catalog and uses no product IDs.',
      });
    }
  });

export const adminAiCatalogCategorizationSchema = z
  .object({
    scope: z.enum(['all_active', 'uncategorized']).default('all_active'),
    confidenceThreshold: z.number().min(0.5).max(0.99).default(0.75),
    batchSize: z.number().int().min(1).max(100).default(25),
    context: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const adminAiProductJobStatusSchema = z.object({}).strict();

type ProductJobContext = {
  ownerKey: string;
  actor: ActionActor;
  conversationId: number;
  autoApply: boolean;
};

export async function generateAdminAiProductContent(
  input: z.input<typeof adminAiProductContentGenerationSchema>,
  context: ProductJobContext,
) {
  const values = adminAiProductContentGenerationSchema.parse(input);
  const productIds = [...new Set(values.productIds)];
  if (values.scope === 'explicit' && productIds.length <= INLINE_PRODUCT_CONTENT_LIMIT) {
    const items = [];
    const failed: Array<{ productId: number; message: string }> = [];

    for (const productId of productIds) {
      try {
        const proposal = await proposeProductContent({
          productId,
          fields: values.fields,
          adminContext: values.context,
          actorId: context.actor.email,
        });
        if (!context.autoApply) {
          items.push({ productId, proposal, application: 'pending_review' as const });
          continue;
        }
        try {
          const applied = await reviewProductContentProposal({
            proposalId: proposal.id,
            action: 'approve',
            actor: context.actor,
          });
          items.push({ productId, proposal, application: 'applied' as const, applied });
        } catch (error) {
          items.push({
            productId,
            proposal,
            application: 'pending_review' as const,
            autoApplyError:
              error instanceof Error ? error.message : 'Automatic application failed.',
          });
        }
      } catch (error) {
        failed.push({
          productId,
          message: error instanceof Error ? error.message : 'Content generation failed.',
        });
      }
    }

    const appliedCount = items.filter((item) => item.application === 'applied').length;
    if (appliedCount > 0) {
      await refreshAppliedAiProposalConsumers('ai-product-content:inline-auto-apply');
    }
    return {
      kind: 'product_content_proposals' as const,
      ok: items.length > 0,
      complete: failed.length === 0 && items.every((item) => item.autoApplyError === undefined),
      autoApply: context.autoApply,
      requestedCount: productIds.length,
      proposalCount: items.length,
      appliedCount,
      pendingReviewCount: items.filter((item) => item.application === 'pending_review').length,
      items,
      failed,
    };
  }

  const result = await startAiContentJob(context.ownerKey, {
    productIds: values.scope === 'all_missing' ? null : productIds,
    fields: values.fields,
    onlyMissing: values.scope === 'all_missing',
    autoApply: context.autoApply,
    conversationId: context.conversationId,
    context: values.context,
    actor: context.actor,
  });
  return {
    kind:
      result.kind === 'busy'
        ? ('product_content_job_busy' as const)
        : ('product_content_job_started' as const),
    ok: result.kind !== 'busy',
    startDisposition: result.kind,
    scope: values.scope,
    resolvedProductCount: values.scope === 'explicit' ? productIds.length : null,
    autoApply: context.autoApply,
    job: result.job,
  };
}

export async function startAdminAiCatalogCategorization(
  input: z.input<typeof adminAiCatalogCategorizationSchema>,
  context: ProductJobContext,
) {
  const values = adminAiCatalogCategorizationSchema.parse(input);
  const result = await startAiCategorizationJob(context.ownerKey, {
    ...values,
    autoApply: context.autoApply,
    conversationId: context.conversationId,
    actor: context.actor,
  });
  return {
    kind:
      result.kind === 'busy'
        ? ('catalog_categorization_job_busy' as const)
        : ('catalog_categorization_job_started' as const),
    ok: result.kind !== 'busy',
    startDisposition: result.kind,
    scope: values.scope,
    autoApply: context.autoApply,
    job: result.job,
  };
}

export async function getAdminAiProductContentJobStatus(ownerKey: string) {
  return {
    kind: 'product_content_job_status' as const,
    job: await getLatestExportJob(ADMIN_AI_CONTENT_QUEUE, ownerKey),
  };
}

export async function getAdminAiCatalogCategorizationStatus(ownerKey: string) {
  return {
    kind: 'catalog_categorization_job_status' as const,
    job: await getLatestExportJob(ADMIN_AI_CATEGORIZATION_QUEUE, ownerKey),
  };
}
