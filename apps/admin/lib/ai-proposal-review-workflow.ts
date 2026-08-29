import { and, eq, lte } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { aiProposals } from '@bric/db/schema';

import { reviewProductCategoryProposal } from './ai-admin-capabilities';
import { reviewProductContentProposal } from './ai-product-content';
import { reviewProductRelationProposal } from './ai-product-knowledge';
export { refreshAppliedAiProposalConsumers } from './background-jobs';

export type AiProposalReviewResource = 'products';

export type AiProposalReviewTarget = {
  proposalType: string;
  entityType: string;
};

export class AiProposalReviewNotFoundError extends Error {}
export class AiProposalExpiredDeletionConflictError extends Error {}

export function aiProposalReviewResource(target: AiProposalReviewTarget): AiProposalReviewResource {
  if (
    target.entityType !== 'products' ||
    !['product_content', 'product_relation', 'product_category'].includes(target.proposalType)
  ) {
    throw new AiProposalReviewNotFoundError('Unsupported proposal type.');
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
  return reviewProductCategoryProposal({
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
