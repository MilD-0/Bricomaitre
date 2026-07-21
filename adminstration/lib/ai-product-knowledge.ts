import { createProductRelationGenerator, getAiConfig, resolveAiModel, UnsupportedProductRelationError, type ProductRelationGenerator } from '@bric/ai-core';
import { and, eq, inArray } from 'drizzle-orm';

import { getDb } from '../db/client';
import { aiProposals, aiRuns, brands, categories, products } from '../db/schema';

export const PRODUCT_RELATION_PROMPT_VERSION = 'product-relation-v1';

export class AiProductNotFoundError extends Error {}
export { UnsupportedProductRelationError };

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
    .where(and(
      inArray(products.id, [input.sourceProductId, input.targetProductId]),
      eq(products.active, true),
    ));

  const sourceProduct = rows.find((row) => row.id === input.sourceProductId);
  const targetProduct = rows.find((row) => row.id === input.targetProductId);
  if (!sourceProduct || !targetProduct) {
    throw new AiProductNotFoundError('Both active products must exist.');
  }

  const [run] = await db.insert(aiRuns).values({
    surface: 'admin',
    task: 'product_relation_proposal',
    status: 'running',
    model,
    promptVersion: PRODUCT_RELATION_PROMPT_VERSION,
    actorId: input.actorId ?? null,
  }).returning({ id: aiRuns.id });

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

    await db.update(aiRuns).set({
      status: 'completed',
      model: generated.model || model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      totalTokens: generated.usage.totalTokens,
      completedAt: now,
    }).where(eq(aiRuns.id, run.id));

    const [proposal] = await db.insert(aiProposals).values({
      runId: run.id,
      proposalType: 'product_relation',
      status: 'proposed',
      entityType: 'products',
      entityId: sourceProduct.id,
      sourceUpdatedAt: sourceProduct.updatedAt,
      payload: generated.proposal,
      reasoning: generated.reasoning,
      requestedBy: input.actorId ?? null,
      expiresAt,
    }).returning({ id: aiProposals.id });

    return {
      id: proposal.id,
      status: 'proposed' as const,
      expiresAt: expiresAt.toISOString(),
      proposal: generated.proposal,
      reasoning: generated.reasoning,
    };
  } catch (error) {
    await db.update(aiRuns).set({
      status: 'failed',
      errorCode: error instanceof Error ? error.name : 'UnknownError',
      completedAt: new Date(),
    }).where(eq(aiRuns.id, run.id));
    throw error;
  }
}
