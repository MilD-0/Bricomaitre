import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDb } from '@bric/db/client';
import {
  actionLogs,
  aiProposals,
  aiRuns,
  categories,
  productRelations,
  products,
} from '@bric/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { reviewProductContentProposal } from '../lib/ai-product-content';
import { reviewProductCategoryProposal } from '../lib/ai-product-category-proposals';
import { reviewProductRelationProposal } from '../lib/ai-product-knowledge';

const namespace = `demo_proposals_${randomUUID().replaceAll('-', '')}`;
const db = createDb({ max: 2, options: `-c search_path=${namespace},public` });
const actor = `demo-proposal-${randomUUID()}@example.invalid`;
vi.mock('@bric/db/client', async (original) => ({
  ...(await original<typeof import('@bric/db/client')>()),
  getDb: () => db,
}));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));

beforeAll(async () => {
  await db.execute(sql.raw(`create schema ${namespace}`));
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  // Keep actual migrated definitions, while isolating all public product/history child reads.
  for (const { tablename } of tables.rows) {
    const table = `"${tablename.replaceAll('"', '""')}"`;
    await db.execute(
      sql.raw(`create table ${namespace}.${table} (like public.${table} including all)`),
    );
  }
});
afterAll(async () => {
  await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor));
  await db.execute(sql.raw(`drop schema ${namespace} cascade`));
  await db.$client.end();
});

it('applies every seeded proposal type through its actual review workflow', async () => {
  const [parent] = await db
    .insert(categories)
    .values({ name: 'Atelier', slug: randomUUID() })
    .returning();
  const [category] = await db
    .insert(categories)
    .values({ name: 'Perceuses', slug: randomUUID(), parentId: parent!.id })
    .returning();
  await db.insert(products).values(
    Array.from({ length: 12 }, (_, index) => ({
      title: `Perceuse ${index}`,
      slug: randomUUID(),
      categoryId: category!.id,
      description: `Perceuse pour les travaux de perçage ${index}.`,
      price: '1000',
      active: true,
    })),
  );
  await db.insert(aiRuns).values(
    Array.from({ length: 12 }, () => ({
      surface: 'admin' as const,
      task: 'admin_chat',
      status: 'completed' as const,
      model: 'demo',
      promptVersion: 'demo-v1',
    })),
  );
  const liveSeed = await readFile(
    resolve(import.meta.dirname, '../../../ops/demo/postgres/seed/90-live.sql'),
    'utf8',
  );
  const marker = '-- Reviewable proposals use the final catalog, after curated campaign revisions.';
  const start = liveSeed.indexOf(marker);
  expect(start).toBeGreaterThan(0);
  const proposalSeed = liveSeed.slice(start);
  for (const type of ['product_content', 'product_category', 'product_relation']) {
    // Each pass uses the current catalog, just as a fresh reset does.
    await db.delete(aiProposals);
    await db.execute(sql.raw(proposalSeed));
    const [proposal] = await db
      .select()
      .from(aiProposals)
      .where(and(eq(aiProposals.proposalType, type), eq(aiProposals.status, 'proposed')))
      .limit(1);
    expect(proposal, type).toBeDefined();
    const payload = proposal!.payload as Record<string, unknown>;
    if (type === 'product_content') {
      await reviewProductContentProposal({
        proposalId: proposal!.id,
        action: 'approve',
        actor: { email: actor },
      });
    } else if (type === 'product_category') {
      await reviewProductCategoryProposal({
        proposalId: proposal!.id,
        action: 'approve',
        actorId: actor,
      });
    } else {
      await reviewProductRelationProposal({
        proposalId: proposal!.id,
        action: 'approve',
        actorId: actor,
      });
    }
    const [saved] = await db.select().from(aiProposals).where(eq(aiProposals.id, proposal!.id));
    expect(saved?.status).toBe('applied');
    if (type === 'product_relation') {
      expect(
        await db
          .select()
          .from(productRelations)
          .where(
            and(
              eq(productRelations.sourceProductId, Number(payload.sourceProductId)),
              eq(productRelations.targetProductId, Number(payload.targetProductId)),
            ),
          ),
      ).toEqual([
        expect.objectContaining({ reviewStatus: 'verified', relationType: 'alternative_to' }),
      ]);
    } else {
      const [product] = await db.select().from(products).where(eq(products.id, proposal!.entityId));
      expect(product).toMatchObject(payload.changes as Record<string, unknown>);
    }
  }
});
