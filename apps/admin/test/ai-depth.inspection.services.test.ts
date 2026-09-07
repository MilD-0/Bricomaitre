import { getDb, getPool } from '@bric/db/client';
import {
  aiConversations,
  aiMessages,
  aiProposals,
  aiRuns,
  categories,
  landingPages,
  orderLineItems,
  orders,
  orderStatusHistory,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { inspectAdminOrders } from '../lib/admin-ai-domain';
import { loadOrderDetail, loadOrderRecordsByIds } from '../lib/admin-orders-data';
import { proposeProductCategoryAssignment } from '../lib/ai-product-category-proposals';
import { executeAiProposalReview } from '../lib/ai-proposal-review-workflow';
import { publishAiTaskTerminalMessage } from '../lib/ai-task-followups';
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
  it('batches exact order inspection with real history, line snapshots and legacy product references', async () => {
    const db = getDb();
    const marker = randomUUID();
    const [product] = await db
      .insert(products)
      .values({ title: 'Current catalog title', slug: marker, price: '10' })
      .returning();
    const rows = await db
      .insert(orders)
      .values([
        {
          firstName: 'Legacy customer',
          phoneNumber1: '0550000111',
          cartProducts: [String(product!.id), String(product!.id)],
          inHouseStatus: ORDER_STATUS.NO_ANSWER,
          noAnswerCount: 2,
        },
        {
          firstName: 'Snapshot customer',
          phoneNumber1: '0550000112',
          cartProducts: [String(product!.id)],
          productSubtotal: '16',
          totalAmount: '16',
          inHouseStatus: ORDER_STATUS.CONFIRMED,
        },
      ])
      .returning();
    try {
      await db.insert(orderStatusHistory).values([
        {
          orderId: rows[0]!.id,
          status: ORDER_STATUS.NO_ANSWER,
          noAnswerCount: 2,
          changedAt: new Date('2026-01-02'),
          changedBy: 'second@example.invalid',
        },
        {
          orderId: rows[0]!.id,
          status: ORDER_STATUS.NO_ANSWER,
          noAnswerCount: 1,
          changedAt: new Date('2026-01-01'),
          changedBy: 'first@example.invalid',
        },
        {
          orderId: rows[1]!.id,
          status: ORDER_STATUS.CONFIRMED,
          changedAt: new Date('2026-01-03'),
          changedBy: 'confirmed@example.invalid',
        },
      ]);
      await db.insert(orderLineItems).values({
        orderId: rows[1]!.id,
        productId: product!.id,
        contentId: String(product!.id),
        rawValue: String(product!.id),
        titleSnapshot: 'Sold product title',
        originalUnitPrice: '10',
        effectiveUnitPrice: '8',
        quantity: 2,
        lineTotal: '16',
      });
      const missingId = Number.MAX_SAFE_INTEGER;
      const result = await inspectAdminOrders({
        orderIds: [rows[1]!.id, missingId, rows[0]!.id, rows[1]!.id],
      });
      expect(result.items.map((item) => item.id)).toEqual([rows[1]!.id, rows[0]!.id]);
      expect(result.missingIds).toEqual([missingId]);
      expect(result.items[0]).toMatchObject({
        products: [
          {
            productId: product!.id,
            title: 'Sold product title',
            quantity: 2,
            unitPrice: 8,
            lineTotal: 16,
          },
        ],
        statusHistory: [{ changedBy: 'confirmed@example.invalid' }],
      });
      expect(result.items[1]).toMatchObject({
        products: [
          { productId: product!.id, title: 'Current catalog title', quantity: 2, unitPrice: 10 },
        ],
        statusHistory: [
          { noAnswerCount: 1, changedBy: 'first@example.invalid' },
          { noAnswerCount: 2, changedBy: 'second@example.invalid' },
        ],
      });
      expect((await loadOrderDetail(rows[0]!.id, db))!.statusHistory).toHaveLength(2);
      expect((await loadOrderRecordsByIds([rows[0]!.id], db))[0]!.statusHistory).toEqual([]);
    } finally {
      await db.delete(orders).where(
        inArray(
          orders.id,
          rows.map((row) => row.id),
        ),
      );
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it.each(['product_content', 'product_category', 'product_relation'])(
    'allows rejecting expired %s proposals while refusing approval',
    async (proposalType) => {
      const db = getDb();
      const marker = randomUUID();
      const [product] = await db
        .insert(products)
        .values({ title: marker, slug: marker, price: '100' })
        .returning();
      const [run] = await db
        .insert(aiRuns)
        .values({
          surface: 'admin',
          task: proposalType,
          model: 'test',
          promptVersion: 'test',
          status: 'completed',
        })
        .returning();
      const [proposal] = await db
        .insert(aiProposals)
        .values({
          runId: run!.id,
          entityType: 'products',
          entityId: product!.id,
          proposalType,
          payload: {},
          sourceUpdatedAt: product!.updatedAt,
          expiresAt: new Date('2000-01-01'),
        })
        .returning();
      try {
        const input = {
          proposalId: proposal!.id,
          target: { proposalType, entityType: 'products' },
          actor: { email: 'reviewer@example.invalid' },
        };
        await expect(
          executeAiProposalReview({ ...input, action: 'approve' }),
        ).rejects.toMatchObject({ code: 'proposal_expired' });
        await expect(
          executeAiProposalReview({ ...input, action: 'reject' }),
        ).resolves.toMatchObject({ status: 'rejected', verified: true });
        expect(
          (await db.select().from(aiProposals).where(eq(aiProposals.id, proposal!.id)))[0],
        ).toMatchObject({ status: 'rejected' });
        expect((await db.select().from(products).where(eq(products.id, product!.id)))[0]).toEqual(
          product,
        );
      } finally {
        await db.delete(aiProposals).where(eq(aiProposals.runId, run!.id));
        await db.delete(aiRuns).where(eq(aiRuns.id, run!.id));
        await db.delete(products).where(eq(products.id, product!.id));
      }
    },
  );

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
});
