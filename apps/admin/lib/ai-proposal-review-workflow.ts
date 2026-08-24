import { and, eq, lte } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { aiProposals } from '@bric/db/schema';

import { reviewAdminProposal } from './ai-admin-capabilities';
import { reviewProductContentProposal } from './ai-product-content';
import { reviewProductRelationProposal } from './ai-product-knowledge';
import { startProductCatalogFeedRefreshJob } from './background-jobs';
import { CACHE_TAGS, revalidateServerTags } from './server-cache';
import { revalidateStorefrontProducts } from './storefront-revalidate';

export type AiProposalReviewResource = 'products' | 'brandsCategories' | 'assets';

export type AiProposalReviewTarget = {
  proposalType: string;
  entityType: string;
};

export class AiProposalReviewNotFoundError extends Error {}
export class AiProposalExpiredDeletionConflictError extends Error {}

export function aiProposalReviewResource(target: AiProposalReviewTarget): AiProposalReviewResource {
  if (target.proposalType === 'featured_products' || target.proposalType === 'landing_page') {
    return 'assets';
  }
  if (target.entityType === 'brands' || target.entityType === 'categories') {
    return 'brandsCategories';
  }
  return 'products';
}

export async function readAiProposalReviewTarget(
  proposalId: number,
): Promise<AiProposalReviewTarget> {
  const [proposal] = await getDb()
    .select({
      proposalType: aiProposals.proposalType,
      entityType: aiProposals.entityType,
    })
    .from(aiProposals)
    .where(eq(aiProposals.id, proposalId))
    .limit(1);
  if (!proposal) throw new AiProposalReviewNotFoundError('Proposal not found.');
  return proposal;
}

export async function executeAiProposalReview(input: {
  proposalId: number;
  action: 'approve' | 'reject';
  target: AiProposalReviewTarget;
  actor: { email?: string | null; name?: string | null };
}) {
  if (input.target.proposalType === 'product_content') {
    return reviewProductContentProposal({
      proposalId: input.proposalId,
      action: input.action,
      actor: input.actor,
    });
  }
  if (input.target.proposalType === 'product_relation') {
    return reviewProductRelationProposal({
      proposalId: input.proposalId,
      action: input.action,
      actorId: input.actor.email,
    });
  }
  return reviewAdminProposal({
    proposalId: input.proposalId,
    action: input.action,
    actorId: input.actor.email,
    actorName: input.actor.name,
  });
}

export async function deleteExpiredAiProposal(proposalId: number, now = new Date()) {
  const [deleted] = await getDb()
    .delete(aiProposals)
    .where(
      and(
        eq(aiProposals.id, proposalId),
        eq(aiProposals.status, 'proposed'),
        lte(aiProposals.expiresAt, now),
      ),
    )
    .returning({ id: aiProposals.id });
  if (!deleted) {
    throw new AiProposalExpiredDeletionConflictError(
      'Only expired pending proposals can be deleted.',
    );
  }
  return deleted;
}

export async function refreshAppliedAiProposalConsumers(trigger = 'ai-product-content:apply') {
  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await revalidateStorefrontProducts();
  await startProductCatalogFeedRefreshJob(trigger).catch(() => undefined);
}
