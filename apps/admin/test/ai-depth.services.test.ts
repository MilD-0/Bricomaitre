import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  aiConversations,
  aiMessages,
  aiProposals,
  aiRuns,
  categories,
  products,
  landingPages,
} from '@bric/db/schema';
import { proposeProductCategoryAssignment } from '../lib/ai-product-category-proposals';
import { publishAiTaskTerminalMessage } from '../lib/ai-task-followups';
import { runAiContentJob } from '../lib/background-jobs';
import { createLandingPage, queryLandingPageSummaries } from '../lib/landing-pages';

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createProductContentGenerator: () => ({
    generate: async ({ fields }: { fields: string[] }) => ({
      changes: Object.fromEntries(fields.map((field) => [field, 'Generated copy'])),
      reasoning: 'Catalog facts',
      usage: {},
      model: 'test-content',
    }),
  }),
}));

afterAll(async () => {
  await getPool().end();
});

describe('durable AI evidence', () => {
  it('serializes competing terminal publishers and tolerates a deleted conversation', async () => {
    const db = getDb();
    const [conversation] = await db
      .insert(aiConversations)
      .values({ surface: 'admin', sessionKey: randomUUID() })
      .returning();
    try {
      const input = {
        conversationId: conversation!.id,
        jobId: randomUUID(),
        kind: 'ai-product-content',
        status: 'completed' as const,
      };
      const results = await Promise.all(
        Array.from({ length: 6 }, () => publishAiTaskTerminalMessage(input)),
      );
      expect(results.filter((result) => result.kind === 'published')).toHaveLength(1);
      expect(
        await db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversation!.id)),
      ).toHaveLength(1);
      await db.delete(aiConversations).where(eq(aiConversations.id, conversation!.id));
      await expect(publishAiTaskTerminalMessage(input)).resolves.toEqual({ kind: 'not-linked' });
    } finally {
      await db.delete(aiConversations).where(eq(aiConversations.id, conversation!.id));
    }
  });

  it('retains inference versions and refuses a product or category changed during classification', async () => {
    const db = getDb(),
      marker = randomUUID();
    const version = new Date('2026-01-01T00:00:00Z');
    const [product] = await db
      .insert(products)
      .values({ title: marker, slug: marker, price: '100', updatedAt: version })
      .returning();
    const [category] = await db
      .insert(categories)
      .values({ name: marker, slug: marker, isActive: true, updatedAt: version })
      .returning();
    const [run] = await db
      .insert(aiRuns)
      .values({
        surface: 'admin',
        task: 'product_categorization',
        model: 'test',
        promptVersion: 'test',
        status: 'completed',
      })
      .returning();
    const input = {
      productId: product!.id,
      categoryId: category!.id,
      runId: run!.id,
      sourceUpdatedAt: version,
      categoryUpdatedAt: version,
      confidence: 0.94,
      reasoning: 'Supplied evidence',
    };
    try {
      await db
        .update(products)
        .set({ title: 'Edited after inference', updatedAt: new Date('2026-01-02T00:00:00Z') })
        .where(eq(products.id, product!.id));
      await expect(proposeProductCategoryAssignment(input)).rejects.toMatchObject({
        code: 'proposal_stale',
      });
      await db.update(products).set({ updatedAt: version }).where(eq(products.id, product!.id));
      await db
        .update(categories)
        .set({ updatedAt: new Date('2026-01-02T00:00:00Z') })
        .where(eq(categories.id, category!.id));
      await expect(proposeProductCategoryAssignment(input)).rejects.toMatchObject({
        code: 'proposal_stale',
      });
      expect(
        await db.select().from(aiProposals).where(eq(aiProposals.runId, run!.id)),
      ).toHaveLength(0);
      await db
        .update(categories)
        .set({ updatedAt: version })
        .where(eq(categories.id, category!.id));
      const result = await proposeProductCategoryAssignment(input);
      const [proposal] = await db.select().from(aiProposals).where(eq(aiProposals.id, result.id));
      expect(proposal).toMatchObject({
        runId: run!.id,
        confidence: '0.9400',
        sourceUpdatedAt: version,
      });
    } finally {
      await db.delete(aiProposals).where(eq(aiProposals.runId, run!.id));
      await db.delete(aiRuns).where(eq(aiRuns.id, run!.id));
      await db.delete(products).where(eq(products.id, product!.id));
      await db.delete(categories).where(eq(categories.id, category!.id));
    }
  });

  it('queries exact and paged landing summaries without returning unrelated pages', async () => {
    const db = getDb(),
      marker = randomUUID();
    const [product] = await db
      .insert(products)
      .values({ title: marker, slug: marker, price: '100' })
      .returning();
    try {
      const fr = await createLandingPage({ productId: product!.id, locale: 'fr' });
      const ar = await createLandingPage({ productId: product!.id, locale: 'ar' });
      const query = {
        landingPageIds: [],
        productIds: [product!.id],
        query: '',
        locale: null,
        active: null,
        page: 1,
        limit: 1,
      };
      const first = await queryLandingPageSummaries(query);
      const second = await queryLandingPageSummaries({ ...query, page: 2 });
      expect(first.pagination).toMatchObject({ total: 2, hasNextPage: true });
      expect(new Set([...first.items, ...second.items].map((item) => item.id))).toEqual(
        new Set([fr.id, ar.id]),
      );
      const exact = await queryLandingPageSummaries({
        ...query,
        landingPageIds: [fr.id],
        locale: 'fr',
      });
      expect(exact.items.map((item) => item.id)).toEqual([fr.id]);
      const empty = await queryLandingPageSummaries({
        ...query,
        landingPageIds: [fr.id],
        locale: 'ar',
      });
      expect(empty).toMatchObject({ items: [], missingIds: [], pagination: { total: 0 } });
    } finally {
      await db.delete(landingPages).where(eq(landingPages.productId, product!.id));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });
  it('regenerates stale and disjoint-field content while retaining a usable pending proposal', async () => {
    const db = getDb(),
      marker = randomUUID(),
      version = new Date('2026-01-02T00:00:00Z');
    const rows = await db
      .insert(products)
      .values(
        ['stale', 'disjoint', 'reusable'].map((label) => ({
          title: label,
          slug: `${marker}-${label}`,
          price: '100',
          updatedAt: version,
        })),
      )
      .returning();
    const [run] = await db
      .insert(aiRuns)
      .values({
        surface: 'admin',
        task: 'product_content_proposal',
        model: 'test',
        promptVersion: 'test',
        status: 'completed',
      })
      .returning();
    const owner = `${marker}@example.invalid`;
    try {
      await db.insert(aiProposals).values(
        rows.map((row, index) => ({
          runId: run!.id,
          proposalType: 'product_content',
          entityType: 'products',
          entityId: row.id,
          status: 'proposed' as const,
          sourceUpdatedAt: index === 0 ? new Date('2026-01-01T00:00:00Z') : version,
          payload: {
            changes:
              index === 1
                ? { descriptionAr: 'Existing Arabic description' }
                : { titleAr: 'Existing Arabic title' },
          },
          expiresAt: new Date(Date.now() + 86400000),
        })),
      );
      vi.stubEnv('AI_CONTENT_MODEL', 'test-content');
      const result = await runAiContentJob(
        {
          __jobMeta: { id: marker, ownerKey: owner, queueName: 'test', activeScope: 'owner' },
          productIds: rows.map((row) => row.id),
          fields: ['titleAr'],
          onlyMissing: false,
          autoApply: false,
          actor: { email: owner },
        },
        {
          throwIfCancelled: async () => {},
          updateProgress: async () => {},
          updateSummary: async () => {},
        },
      );
      expect(result).toMatchObject({ proposed: 2, alreadyProposed: 1, failed: 0, complete: true });
    } finally {
      vi.unstubAllEnvs();
      for (const row of rows) await db.delete(aiProposals).where(eq(aiProposals.entityId, row.id));
      await db.delete(aiRuns).where(eq(aiRuns.actorId, owner));
      await db.delete(aiRuns).where(eq(aiRuns.id, run!.id));
      for (const row of rows) await db.delete(products).where(eq(products.id, row.id));
    }
  });
});
