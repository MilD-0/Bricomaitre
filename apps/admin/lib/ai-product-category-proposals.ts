import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { aiProposals, categories, products } from '@bric/db/schema';
import { fetchProductState } from './action-history-state';
import { recordExplicitActionLog } from './action-history';
import { AiProposalReviewConflictError } from './ai-proposal-review';
import { persistedProposalValuesMatch } from './ai-proposal-verification';

export const PRODUCT_CATEGORY_CHANGE_SCHEMA = z
  .object({ categoryId: z.number().int().positive() })
  .strict();

export class ProductCategoryProposalError extends AiProposalReviewConflictError {}

export async function proposeProductCategoryAssignment(input: {
  productId: number;
  categoryId: number;
  actorId?: string | null;
  reasoning: string;
  runId: number;
  sourceUpdatedAt: Date;
  categoryUpdatedAt: Date;
  confidence: number;
}) {
  const changes = PRODUCT_CATEGORY_CHANGE_SCHEMA.parse({ categoryId: input.categoryId });
  const db = getDb();
  const [[product], [category]] = await Promise.all([
    db.select().from(products).where(eq(products.id, input.productId)).limit(1),
    db.select().from(categories).where(eq(categories.id, changes.categoryId)).limit(1),
  ]);
  if (!product) throw new ProductCategoryProposalError('Product not found.');
  if (!category?.isActive)
    throw new ProductCategoryProposalError('Active assigned category not found.');
  if (
    product.updatedAt.getTime() !== input.sourceUpdatedAt.getTime() ||
    category.updatedAt.getTime() !== input.categoryUpdatedAt.getTime()
  ) {
    throw new ProductCategoryProposalError(
      'Classification evidence changed during generation.',
      'proposal_stale',
    );
  }
  if (product.categoryId === changes.categoryId) {
    throw new ProductCategoryProposalError('The product is already assigned to this category.');
  }

  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  const [proposal] = await db
    .insert(aiProposals)
    .values({
      runId: input.runId,
      proposalType: 'product_category',
      entityType: 'products',
      entityId: product.id,
      sourceUpdatedAt: input.sourceUpdatedAt,
      payload: {
        before: { categoryId: product.categoryId },
        changes,
        dependencies: {
          category: { id: category.id, updatedAt: input.categoryUpdatedAt.toISOString() },
        },
      },
      reasoning: input.reasoning,
      confidence: input.confidence.toFixed(4),
      requestedBy: input.actorId ?? null,
      expiresAt,
    })
    .returning({ id: aiProposals.id });

  return {
    id: proposal.id,
    type: 'product_category' as const,
    status: 'proposed' as const,
    reasoning: input.reasoning,
    expiresAt: expiresAt.toISOString(),
    payload: { before: { categoryId: product.categoryId }, changes },
  };
}

const categoryDependencySchema = z
  .object({
    category: z
      .object({ id: z.number().int().positive(), updatedAt: z.string().datetime() })
      .strict(),
  })
  .strict();

export async function reviewProductCategoryProposal(input: {
  proposalId: number;
  action: 'approve' | 'reject';
  actorId?: string | null;
  actorName?: string | null;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(aiProposals)
      .where(and(eq(aiProposals.id, input.proposalId), eq(aiProposals.status, 'proposed')))
      .limit(1)
      .for('update');
    if (
      !proposal ||
      proposal.proposalType !== 'product_category' ||
      proposal.entityType !== 'products'
    ) {
      throw new ProductCategoryProposalError(
        'Product category proposal is unavailable or already reviewed.',
        'proposal_already_reviewed',
      );
    }
    if (input.action === 'reject') {
      const [rejected] = await tx
        .update(aiProposals)
        .set({
          status: 'rejected',
          reviewedBy: input.actorId ?? null,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(aiProposals.id, proposal.id), eq(aiProposals.status, 'proposed')))
        .returning({ id: aiProposals.id });
      if (!rejected) {
        throw new ProductCategoryProposalError(
          'The proposal changed while it was being reviewed.',
          'proposal_already_reviewed',
        );
      }
      return { id: proposal.id, status: 'rejected' as const, verified: true as const };
    }
    if (proposal.expiresAt <= new Date()) {
      throw new ProductCategoryProposalError(
        'Proposal expired. Generate a new proposal.',
        'proposal_expired',
      );
    }

    const [product] = await tx
      .select()
      .from(products)
      .where(eq(products.id, proposal.entityId))
      .limit(1)
      .for('update');
    if (
      !product ||
      !proposal.sourceUpdatedAt ||
      product.updatedAt.getTime() !== proposal.sourceUpdatedAt.getTime()
    ) {
      throw new ProductCategoryProposalError(
        'The product changed after this proposal was generated. Generate it again.',
        'proposal_stale',
      );
    }

    const payload = proposal.payload as Record<string, unknown>;
    const changesResult = PRODUCT_CATEGORY_CHANGE_SCHEMA.safeParse(payload.changes);
    const dependenciesResult = categoryDependencySchema.safeParse(payload.dependencies);
    if (!changesResult.success || !dependenciesResult.success) {
      throw new ProductCategoryProposalError(
        'The category proposal payload is no longer valid. Generate it again.',
        'proposal_dependency_changed',
      );
    }
    const changes = changesResult.data;
    const dependencies = dependenciesResult.data;
    if (dependencies.category.id !== changes.categoryId) {
      throw new ProductCategoryProposalError(
        'The proposal category dependency is inconsistent. Generate it again.',
        'proposal_dependency_changed',
      );
    }
    const [category] = await tx
      .select()
      .from(categories)
      .where(eq(categories.id, changes.categoryId))
      .limit(1)
      .for('update');
    if (
      !category?.isActive ||
      category.updatedAt.getTime() !== new Date(dependencies.category.updatedAt).getTime()
    ) {
      throw new ProductCategoryProposalError(
        'The assigned category changed after this proposal was generated. Generate it again.',
        'proposal_dependency_changed',
      );
    }

    const beforeState = await fetchProductState(tx, product.id);
    const [persisted] = await tx
      .update(products)
      .set({ categoryId: changes.categoryId, updatedAt: new Date() })
      .where(eq(products.id, product.id))
      .returning();
    if (!persistedProposalValuesMatch(persisted, changes)) {
      throw new ProductCategoryProposalError(
        'The category assignment could not be verified in the database. Nothing was marked as applied.',
        'proposal_verification_failed',
      );
    }
    await recordExplicitActionLog(tx, {
      entityType: 'products',
      entityId: product.id,
      operation: 'update',
      beforeState,
      afterState: await fetchProductState(tx, product.id),
      actor: { email: input.actorId, name: input.actorName },
    });
    const [applied] = await tx
      .update(aiProposals)
      .set({
        status: 'applied',
        reviewedBy: input.actorId ?? null,
        reviewedAt: new Date(),
        appliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(aiProposals.id, proposal.id), eq(aiProposals.status, 'proposed')))
      .returning({ id: aiProposals.id, status: aiProposals.status });
    if (!applied || applied.status !== 'applied') {
      throw new ProductCategoryProposalError(
        'The proposal result could not be recorded after verification.',
        'proposal_already_reviewed',
      );
    }
    return {
      id: proposal.id,
      status: 'applied' as const,
      verified: true as const,
      proposalType: proposal.proposalType,
    };
  });
}
