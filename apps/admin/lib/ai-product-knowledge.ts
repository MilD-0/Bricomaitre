import {
  createProductRelationGenerator,
  getAiConfig,
  MIN_AI_PRODUCT_RELATION_CONFIDENCE,
  productRelationProposalSchema,
  resolveAiModel,
  UnsupportedProductRelationError,
  type ProductRelationGenerator,
} from '@bric/ai-core';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  aiProposals,
  aiRuns,
  brands,
  categories,
  productRelationEvidence,
  productRelations,
  products,
} from '@bric/db/schema';
import { AiProposalReviewConflictError } from './ai-proposal-review';

const PRODUCT_RELATION_PROMPT_VERSION = 'product-relation-v1';

export class AiProductNotFoundError extends Error {}
export class AiProductRelationConflictError extends AiProposalReviewConflictError {}
export { UnsupportedProductRelationError };

type ProposalEvidence = { label: string; url?: string; excerpt?: string };
type CatalogEvidenceProduct = {
  title: string;
  description: string | null;
  category: string | null;
  brand: string | null;
};

const ADMIN_EVIDENCE_LABEL = 'Administrator-provided evidence';
const SOURCE_DESCRIPTION_LABEL = 'Source catalog description';
const TARGET_DESCRIPTION_LABEL = 'Target catalog description';

export function areProductRelationDependenciesFresh(input: {
  source: { updatedAt: Date } | undefined;
  target: { updatedAt: Date } | undefined;
  sourceUpdatedAt: Date | null;
  targetUpdatedAt?: Date;
}) {
  return Boolean(
    input.source &&
    input.target &&
    input.sourceUpdatedAt &&
    input.source.updatedAt.getTime() === input.sourceUpdatedAt.getTime() &&
    (!input.targetUpdatedAt ||
      input.target.updatedAt.getTime() === input.targetUpdatedAt.getTime()),
  );
}

function truncateEvidence(value: string) {
  return value.trim().slice(0, 2_000);
}

export function buildProductRelationEvidence(input: {
  sourceProduct: CatalogEvidenceProduct;
  targetProduct: CatalogEvidenceProduct;
  adminContext?: string;
}): ProposalEvidence[] {
  const evidence: ProposalEvidence[] = [
    {
      label: 'Source catalog identity',
      excerpt: truncateEvidence(
        [input.sourceProduct.title, input.sourceProduct.brand, input.sourceProduct.category]
          .filter(Boolean)
          .join(' · '),
      ),
    },
    {
      label: 'Target catalog identity',
      excerpt: truncateEvidence(
        [input.targetProduct.title, input.targetProduct.brand, input.targetProduct.category]
          .filter(Boolean)
          .join(' · '),
      ),
    },
  ];
  if (input.sourceProduct.description?.trim()) {
    evidence.push({
      label: SOURCE_DESCRIPTION_LABEL,
      excerpt: truncateEvidence(input.sourceProduct.description),
    });
  }
  if (input.targetProduct.description?.trim()) {
    evidence.push({
      label: TARGET_DESCRIPTION_LABEL,
      excerpt: truncateEvidence(input.targetProduct.description),
    });
  }
  if (input.adminContext?.trim()) {
    evidence.push({
      label: ADMIN_EVIDENCE_LABEL,
      excerpt: truncateEvidence(input.adminContext),
    });
  }
  return evidence;
}

export function hasSufficientProductRelationEvidence(
  relationType:
    'compatible_with' | 'requires' | 'alternative_to' | 'accessory_for' | 'frequently_bought_with',
  evidence: ProposalEvidence[],
) {
  const labels = new Set(evidence.map((item) => item.label));
  const hasAdminEvidence = labels.has(ADMIN_EVIDENCE_LABEL);
  if (relationType === 'frequently_bought_with') return hasAdminEvidence;
  if (['compatible_with', 'requires', 'accessory_for'].includes(relationType)) {
    return (
      hasAdminEvidence ||
      (labels.has(SOURCE_DESCRIPTION_LABEL) && labels.has(TARGET_DESCRIPTION_LABEL))
    );
  }
  return evidence.some((item) => item.excerpt?.trim() || item.url?.trim());
}

export async function proposeProductRelation(input: {
  sourceProductId: number;
  targetProductId: number;
  adminContext?: string;
  actorId?: string | null;
  generator?: ProductRelationGenerator;
}) {
  const db = getDb();
  const config = getAiConfig();
  const model = resolveAiModel(config, 'admin');
  const generator = input.generator ?? createProductRelationGenerator(config);
  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      description: products.description,
      updatedAt: products.updatedAt,
      category: categories.name,
      brand: brands.name,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(
      and(
        inArray(products.id, [input.sourceProductId, input.targetProductId]),
        eq(products.active, true),
      ),
    );

  const sourceProduct = rows.find((row) => row.id === input.sourceProductId);
  const targetProduct = rows.find((row) => row.id === input.targetProductId);
  if (!sourceProduct || !targetProduct) {
    throw new AiProductNotFoundError('Both active products must exist.');
  }

  const [run] = await db
    .insert(aiRuns)
    .values({
      surface: 'admin',
      task: 'product_relation_proposal',
      status: 'running',
      model,
      promptVersion: PRODUCT_RELATION_PROMPT_VERSION,
      actorId: input.actorId ?? null,
    })
    .returning({ id: aiRuns.id });

  try {
    const generated = await generator.generate({
      sourceProduct: {
        id: sourceProduct.id,
        title: sourceProduct.title,
        description: sourceProduct.description,
        category: sourceProduct.category,
        brand: sourceProduct.brand,
      },
      targetProduct: {
        id: targetProduct.id,
        title: targetProduct.title,
        description: targetProduct.description,
        category: targetProduct.category,
        brand: targetProduct.brand,
      },
      adminContext: input.adminContext,
    });
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);

    await db
      .update(aiRuns)
      .set({
        status: 'completed',
        model: generated.model || model,
        inputTokens: generated.usage.inputTokens,
        outputTokens: generated.usage.outputTokens,
        totalTokens: generated.usage.totalTokens,
        completedAt: now,
      })
      .where(eq(aiRuns.id, run.id));

    const [proposal] = await db
      .insert(aiProposals)
      .values({
        runId: run.id,
        proposalType: 'product_relation',
        status: 'proposed',
        entityType: 'products',
        entityId: sourceProduct.id,
        sourceUpdatedAt: sourceProduct.updatedAt,
        payload: {
          ...generated.proposal,
          dependencyVersions: {
            sourceUpdatedAt: sourceProduct.updatedAt.toISOString(),
            targetUpdatedAt: targetProduct.updatedAt.toISOString(),
          },
        },
        reasoning: generated.reasoning,
        evidence: buildProductRelationEvidence({
          sourceProduct,
          targetProduct,
          adminContext: input.adminContext,
        }),
        confidence:
          generated.proposal.confidence == null ? null : generated.proposal.confidence.toFixed(4),
        requestedBy: input.actorId ?? null,
        expiresAt,
      })
      .returning({ id: aiProposals.id });

    return {
      id: proposal.id,
      status: 'proposed' as const,
      expiresAt: expiresAt.toISOString(),
      proposal: generated.proposal,
      reasoning: generated.reasoning,
    };
  } catch (error) {
    await db
      .update(aiRuns)
      .set({
        status: 'failed',
        errorCode: error instanceof Error ? error.name : 'UnknownError',
        completedAt: new Date(),
      })
      .where(eq(aiRuns.id, run.id));
    throw error;
  }
}

export async function reviewProductRelationProposal(input: {
  proposalId: number;
  action: 'approve' | 'reject';
  actorId?: string | null;
}) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [proposal] = await tx
      .select()
      .from(aiProposals)
      .where(and(eq(aiProposals.id, input.proposalId), eq(aiProposals.status, 'proposed')))
      .limit(1)
      .for('update');
    if (!proposal || proposal.proposalType !== 'product_relation') {
      throw new AiProductRelationConflictError(
        'The relationship proposal is unavailable or already reviewed.',
        'proposal_already_reviewed',
      );
    }
    if (proposal.expiresAt <= new Date()) {
      throw new AiProductRelationConflictError(
        'The relationship proposal has expired. Generate a new proposal.',
        'proposal_expired',
      );
    }

    const now = new Date();
    if (input.action === 'reject') {
      const [rejected] = await tx
        .update(aiProposals)
        .set({
          status: 'rejected',
          reviewedBy: input.actorId ?? null,
          reviewedAt: now,
          updatedAt: now,
        })
        .where(and(eq(aiProposals.id, proposal.id), eq(aiProposals.status, 'proposed')))
        .returning({ id: aiProposals.id });
      if (!rejected) {
        throw new AiProductRelationConflictError(
          'The proposal changed while it was being reviewed.',
          'proposal_already_reviewed',
        );
      }
      return { id: proposal.id, status: 'rejected' as const, verified: true };
    }

    const rawPayload = proposal.payload as Record<string, unknown>;
    const relation = productRelationProposalSchema.parse(rawPayload);
    const dependencyVersions = z
      .object({
        sourceUpdatedAt: z.string().datetime(),
        targetUpdatedAt: z.string().datetime(),
      })
      .strict()
      .optional()
      .parse(rawPayload.dependencyVersions);
    const confidence = relation.confidence ?? Number(proposal.confidence ?? 0);
    const visibleEvidence = proposal.evidence.filter(
      (item) => item.label.trim() && (item.url?.trim() || item.excerpt?.trim()),
    );
    if (
      visibleEvidence.length === 0 ||
      !relation.evidenceSummary?.trim() ||
      !hasSufficientProductRelationEvidence(relation.relationType, visibleEvidence) ||
      confidence < MIN_AI_PRODUCT_RELATION_CONFIDENCE
    ) {
      throw new AiProductRelationConflictError(
        'A relationship needs visible source evidence and sufficient confidence before approval.',
        'proposal_evidence_insufficient',
      );
    }

    const productsFound = await tx
      .select({ id: products.id, active: products.active, updatedAt: products.updatedAt })
      .from(products)
      .where(inArray(products.id, [relation.sourceProductId, relation.targetProductId]))
      .for('update');
    if (productsFound.length !== 2 || productsFound.some((product) => !product.active)) {
      throw new AiProductRelationConflictError(
        'One of the related products no longer exists or is inactive. Generate a new proposal.',
        'proposal_dependency_changed',
      );
    }
    const source = productsFound.find((product) => product.id === relation.sourceProductId);
    const target = productsFound.find((product) => product.id === relation.targetProductId);
    const sourceUpdatedAt = dependencyVersions?.sourceUpdatedAt
      ? new Date(dependencyVersions.sourceUpdatedAt)
      : proposal.sourceUpdatedAt;
    if (
      !areProductRelationDependenciesFresh({
        source,
        target,
        sourceUpdatedAt,
        targetUpdatedAt: dependencyVersions
          ? new Date(dependencyVersions.targetUpdatedAt)
          : undefined,
      })
    ) {
      throw new AiProductRelationConflictError(
        'One of the related products changed. Generate a new proposal.',
        'proposal_dependency_changed',
      );
    }

    const [persisted] = await tx
      .insert(productRelations)
      .values({
        sourceProductId: relation.sourceProductId,
        targetProductId: relation.targetProductId,
        relationType: relation.relationType,
        source: 'ai',
        confidence: confidence.toFixed(4),
        reviewStatus: 'verified',
        createdBy: proposal.requestedBy,
        reviewedBy: input.actorId ?? null,
        reviewedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          productRelations.sourceProductId,
          productRelations.targetProductId,
          productRelations.relationType,
        ],
        set: {
          source: 'ai',
          confidence: confidence.toFixed(4),
          reviewStatus: 'verified',
          reviewedBy: input.actorId ?? null,
          reviewedAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: productRelations.id });
    if (!persisted) {
      throw new AiProductRelationConflictError(
        'The relationship could not be verified.',
        'proposal_verification_failed',
      );
    }
    await tx
      .delete(productRelationEvidence)
      .where(eq(productRelationEvidence.relationId, persisted.id));
    await tx.insert(productRelationEvidence).values(
      visibleEvidence.map((evidence) => ({
        relationId: persisted.id,
        evidenceType:
          evidence.label === 'Administrator-provided evidence'
            ? ('admin_note' as const)
            : ('other' as const),
        sourceUrl: evidence.url ?? null,
        sourceLabel: evidence.label,
        excerpt: evidence.excerpt ?? relation.evidenceSummary,
        metadata: { proposalId: proposal.id },
      })),
    );
    const [applied] = await tx
      .update(aiProposals)
      .set({
        status: 'applied',
        reviewedBy: input.actorId ?? null,
        reviewedAt: now,
        appliedAt: now,
        updatedAt: now,
      })
      .where(and(eq(aiProposals.id, proposal.id), eq(aiProposals.status, 'proposed')))
      .returning({ id: aiProposals.id });
    if (!applied) {
      throw new AiProductRelationConflictError(
        'The proposal changed while it was being reviewed.',
        'proposal_already_reviewed',
      );
    }
    return { id: proposal.id, status: 'applied' as const, verified: true };
  });
}
