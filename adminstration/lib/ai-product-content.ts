import {
  createProductContentGenerator,
  getAiConfig,
  productContentChangesSchema,
  productContentFieldSchema,
  resolveAiModel,
  type ProductContentGenerator,
} from '@bric/ai-core';
import { and, desc, eq } from 'drizzle-orm';

import { getDb } from '../db/client';
import { aiProposals, aiRuns, brands, categories, products } from '../db/schema';
import { mutateEntityWithHistory, type ActionActor } from './action-history';
import { persistedProposalValuesMatch } from './ai-proposal-verification';

export const PRODUCT_CONTENT_PROMPT_VERSION = 'product-content-v1';
const CONTENT_FIELDS = ['title', 'titleAr', 'description', 'descriptionAr'] as const;

export class AiContentNotFoundError extends Error {}
export class AiProposalConflictError extends Error {}

export function isContentProposalFresh(input: {
  sourceUpdatedAt: Date | null;
  productUpdatedAt: Date;
  expiresAt: Date;
  now?: Date;
}) {
  return Boolean(
    input.sourceUpdatedAt
    && input.sourceUpdatedAt.getTime() === input.productUpdatedAt.getTime()
    && input.expiresAt > (input.now ?? new Date()),
  );
}

function contentSnapshot(product: { title: string; titleAr: string | null; description: string | null; descriptionAr: string | null }) {
  return {
    title: product.title,
    titleAr: product.titleAr,
    description: product.description,
    descriptionAr: product.descriptionAr,
  };
}

export async function proposeProductContent(input: {
  productId: number;
  fields?: Array<(typeof CONTENT_FIELDS)[number]>;
  adminContext?: string;
  actorId?: string | null;
  generator?: ProductContentGenerator;
}) {
  const db = getDb();
  const config = getAiConfig();
  const model = resolveAiModel(config, 'content');
  const generator = input.generator ?? createProductContentGenerator(config);
  const [product] = await db.select({
    id: products.id,
    title: products.title,
    titleAr: products.titleAr,
    description: products.description,
    descriptionAr: products.descriptionAr,
    sku: products.sku,
    updatedAt: products.updatedAt,
    category: categories.name,
    brand: brands.name,
  }).from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(brands, eq(products.brandId, brands.id))
    .where(and(eq(products.id, input.productId), eq(products.active, true)))
    .limit(1);

  if (!product) throw new AiContentNotFoundError('Active product not found.');

  const requestedFields = input.fields?.length
    ? input.fields
    : CONTENT_FIELDS.filter((field) => !product[field]?.trim());
  const fields = requestedFields.map((field) => productContentFieldSchema.parse(field));
  if (fields.length === 0) throw new AiProposalConflictError('This product has no missing content fields.');

  const [run] = await db.insert(aiRuns).values({
    surface: 'admin', task: 'product_content_proposal', status: 'running', model,
    promptVersion: PRODUCT_CONTENT_PROMPT_VERSION, actorId: input.actorId ?? null,
  }).returning({ id: aiRuns.id });

  try {
    const generated = await generator.generate({
      product: {
        id: product.id, title: product.title, titleAr: product.titleAr,
        description: product.description, descriptionAr: product.descriptionAr,
        category: product.category, brand: product.brand, sku: product.sku,
      },
      fields,
      adminContext: input.adminContext,
    });
    if (persistedProposalValuesMatch(product, generated.changes)) {
      throw new AiProposalConflictError('The generated content does not change the current product.');
    }
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000);
    await db.update(aiRuns).set({
      status: 'completed', model: generated.model || model,
      inputTokens: generated.usage.inputTokens, outputTokens: generated.usage.outputTokens,
      totalTokens: generated.usage.totalTokens, completedAt: now,
    }).where(eq(aiRuns.id, run.id));
    const [proposal] = await db.insert(aiProposals).values({
      runId: run.id, proposalType: 'product_content', status: 'proposed',
      entityType: 'products', entityId: product.id, sourceUpdatedAt: product.updatedAt,
      payload: { before: contentSnapshot(product), changes: generated.changes },
      reasoning: generated.reasoning, requestedBy: input.actorId ?? null, expiresAt,
    }).returning({ id: aiProposals.id });

    return { id: proposal.id, status: 'proposed' as const, expiresAt: expiresAt.toISOString(), changes: generated.changes, before: contentSnapshot(product), reasoning: generated.reasoning };
  } catch (error) {
    await db.update(aiRuns).set({ status: 'failed', errorCode: error instanceof Error ? error.name : 'UnknownError', completedAt: new Date() }).where(eq(aiRuns.id, run.id));
    throw error;
  }
}

export async function listProductContentProposals(productId: number) {
  const db = getDb();
  const rows = await db.select().from(aiProposals).where(and(
    eq(aiProposals.entityType, 'products'),
    eq(aiProposals.entityId, productId),
    eq(aiProposals.proposalType, 'product_content'),
    eq(aiProposals.status, 'proposed'),
  )).orderBy(desc(aiProposals.createdAt));

  return rows.map((row) => {
    const payload = row.payload as { before?: unknown; changes?: unknown };
    return {
      id: row.id, status: row.status, reasoning: row.reasoning,
      before: payload.before, changes: productContentChangesSchema.parse(payload.changes),
      expiresAt: row.expiresAt.toISOString(), createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function reviewProductContentProposal(input: { proposalId: number; action: 'approve' | 'reject'; actor: ActionActor }) {
  const db = getDb();
  const [initial] = await db.select().from(aiProposals).where(eq(aiProposals.id, input.proposalId)).limit(1);
  if (!initial || initial.proposalType !== 'product_content' || initial.entityType !== 'products') {
    throw new AiContentNotFoundError('Product content proposal not found.');
  }
  if (initial.status !== 'proposed') throw new AiProposalConflictError('This proposal has already been reviewed.');

  if (input.action === 'reject') {
    await db.update(aiProposals).set({ status: 'rejected', reviewedBy: input.actor.email ?? null, reviewedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(aiProposals.id, input.proposalId), eq(aiProposals.status, 'proposed')));
    return { id: initial.id, status: 'rejected' as const };
  }

  const changes = productContentChangesSchema.parse((initial.payload as { changes?: unknown }).changes);
  const [updated] = await mutateEntityWithHistory(db, {
    entityType: 'products', entityId: initial.entityId, operation: 'update', actor: input.actor,
    execute: async (tx) => {
      const [proposal] = await tx.select().from(aiProposals).where(and(eq(aiProposals.id, input.proposalId), eq(aiProposals.status, 'proposed'))).limit(1);
      const [product] = await tx.select().from(products).where(eq(products.id, initial.entityId)).limit(1);
      if (!proposal || !product) throw new AiProposalConflictError('The proposal or product is no longer available.');
      if (!isContentProposalFresh({ sourceUpdatedAt: proposal.sourceUpdatedAt, productUpdatedAt: product.updatedAt, expiresAt: proposal.expiresAt })) {
        throw new AiProposalConflictError('The proposal is stale or expired. Generate a new proposal.');
      }
      const [next] = await tx.update(products).set({ ...changes, updatedAt: new Date() }).where(eq(products.id, product.id)).returning();
      if (!persistedProposalValuesMatch(next, changes)) {
        throw new AiProposalConflictError('The approved product changes could not be verified in the database. Nothing was marked as applied.');
      }
      const [applied] = await tx.update(aiProposals).set({ status: 'applied', reviewedBy: input.actor.email ?? null, reviewedAt: new Date(), appliedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(aiProposals.id, proposal.id), eq(aiProposals.status, 'proposed')))
        .returning({ id: aiProposals.id, status: aiProposals.status });
      if (!applied || applied.status !== 'applied') {
        throw new AiProposalConflictError('The proposal result could not be recorded after verification.');
      }
      return [next];
    },
  });
  return { id: initial.id, status: 'applied' as const, verified: true as const, product: updated };
}
