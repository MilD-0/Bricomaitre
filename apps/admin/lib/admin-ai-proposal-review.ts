import { z } from 'zod';

import {
  aiProposalReviewResource,
  deleteExpiredAiProposal,
  executeAiProposalReview,
  readAiProposalReviewTarget,
  refreshAppliedAiProposalConsumers,
  type AiProposalReviewResource,
  type AiProposalReviewTarget,
} from './ai-proposal-review-workflow';
import type { PermissionKey } from './permissions';

export const adminAiProposalReviewSchema = z
  .object({
    proposalIds: z.array(z.number().int().positive()).min(1).max(50),
    action: z.enum(['approve', 'reject']),
  })
  .strict();

export const adminAiExpiredProposalDeletionSchema = z
  .object({ proposalIds: z.array(z.number().int().positive()).min(1).max(50) })
  .strict();

type ReviewDependencies = {
  readTarget: (proposalId: number) => Promise<AiProposalReviewTarget>;
  executeReview: typeof executeAiProposalReview;
  refreshAppliedConsumers: typeof refreshAppliedAiProposalConsumers;
};

const defaultDependencies: ReviewDependencies = {
  readTarget: readAiProposalReviewTarget,
  executeReview: executeAiProposalReview,
  refreshAppliedConsumers: refreshAppliedAiProposalConsumers,
};

type ExpiredDeletionDependencies = {
  readTarget: (proposalId: number) => Promise<AiProposalReviewTarget>;
  deleteExpired: (proposalId: number) => Promise<{ id: number }>;
};

const defaultExpiredDeletionDependencies: ExpiredDeletionDependencies = {
  readTarget: readAiProposalReviewTarget,
  deleteExpired: deleteExpiredAiProposal,
};

const resourcePermission: Record<AiProposalReviewResource, PermissionKey> = {
  products: 'products_write',
  brandsCategories: 'brands_categories_write',
  assets: 'assets_write',
};

export async function reviewAdminAiProposals(
  input: z.infer<typeof adminAiProposalReviewSchema>,
  actor: { email?: string | null; name?: string | null },
  permissions: readonly PermissionKey[],
  dependencies: ReviewDependencies = defaultDependencies,
) {
  const parsed = adminAiProposalReviewSchema.parse(input);
  const reviewed: Array<{
    proposalId: number;
    resource: AiProposalReviewResource;
    result: Awaited<ReturnType<typeof executeAiProposalReview>>;
  }> = [];
  const failed: Array<{ proposalId: number; error: string }> = [];

  for (const proposalId of [...new Set(parsed.proposalIds)]) {
    try {
      const target = await dependencies.readTarget(proposalId);
      const resource = aiProposalReviewResource(target);
      if (!permissions.includes(resourcePermission[resource])) {
        failed.push({ proposalId, error: `Missing permission for ${resource}.` });
        continue;
      }
      const result = await dependencies.executeReview({
        proposalId,
        action: parsed.action,
        target,
        actor,
      });
      reviewed.push({ proposalId, resource, result });
    } catch (error) {
      failed.push({
        proposalId,
        error: error instanceof Error ? error.message : 'Proposal review failed.',
      });
    }
  }

  const appliedCount = reviewed.filter(({ result }) => result.status === 'applied').length;
  if (appliedCount > 0) await dependencies.refreshAppliedConsumers('admin-ai:proposal-review');

  return {
    action: parsed.action,
    requestedCount: new Set(parsed.proposalIds).size,
    reviewedCount: reviewed.length,
    appliedCount,
    rejectedCount: reviewed.filter(({ result }) => result.status === 'rejected').length,
    reviewed,
    failed,
  };
}

export async function deleteExpiredAdminAiProposals(
  input: z.infer<typeof adminAiExpiredProposalDeletionSchema>,
  permissions: readonly PermissionKey[],
  dependencies: ExpiredDeletionDependencies = defaultExpiredDeletionDependencies,
) {
  const parsed = adminAiExpiredProposalDeletionSchema.parse(input);
  const deleted: Array<{ proposalId: number; resource: AiProposalReviewResource }> = [];
  const failed: Array<{ proposalId: number; error: string }> = [];

  for (const proposalId of [...new Set(parsed.proposalIds)]) {
    try {
      const target = await dependencies.readTarget(proposalId);
      const resource = aiProposalReviewResource(target);
      if (!permissions.includes(resourcePermission[resource])) {
        failed.push({ proposalId, error: `Missing permission for ${resource}.` });
        continue;
      }
      await dependencies.deleteExpired(proposalId);
      deleted.push({ proposalId, resource });
    } catch (error) {
      failed.push({
        proposalId,
        error: error instanceof Error ? error.message : 'Expired proposal deletion failed.',
      });
    }
  }

  return {
    requestedCount: new Set(parsed.proposalIds).size,
    deletedCount: deleted.length,
    failedCount: failed.length,
    deleted,
    failed,
  };
}
