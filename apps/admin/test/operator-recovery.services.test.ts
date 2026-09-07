import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import { actionLogs, aiProposals, aiRuns, categories, products } from '@bric/db/schema';
import {
  applyHistoryAction,
  loadActionHistoryDetail,
  mutateEntityWithHistory,
  mutateEntityWithHistoryTransaction,
} from '../lib/action-history';
import {
  proposeProductCategoryAssignment,
  reviewProductCategoryProposal,
} from '../lib/ai-product-category-proposals';
import { adjustAdminInventory } from '../lib/admin-ai-inventory';
import { adminAiToolConfirmsCompletedMutation } from '../lib/admin-ai-execution-capabilities';

vi.mock('../lib/storefront-revalidate', () => ({ revalidateStorefrontProducts: vi.fn() }));
vi.mock('../lib/server-cache', async (original) => ({
  ...(await original<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));
const db = getDb();
const actor = { email: `operator-recovery-${randomUUID()}@example.invalid` };
const productIds: number[] = [],
  categoryIds: number[] = [],
  runIds: number[] = [];
afterAll(async () => {
  await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
  if (runIds.length) {
    await db.delete(aiProposals).where(inArray(aiProposals.runId, runIds));
    await db.delete(aiRuns).where(inArray(aiRuns.id, runIds));
  }
  if (productIds.length) await db.delete(products).where(inArray(products.id, productIds));
  if (categoryIds.length) await db.delete(categories).where(inArray(categories.id, categoryIds));
  await getPool().end();
});
async function product(quantity = 10) {
  const [row] = await db
    .insert(products)
    .values({ title: 'Before', slug: randomUUID(), price: '1000', inventoryQuantity: quantity })
    .returning();
  productIds.push(row!.id);
  return row!;
}
async function category() {
  const [row] = await db
    .insert(categories)
    .values({ name: 'Category', slug: randomUUID(), isActive: true })
    .returning();
  categoryIds.push(row!.id);
  return row!;
}
async function latest(entityType: string, entityId: number) {
  const [entry] = await db
    .select()
    .from(actionLogs)
    .where(and(eq(actionLogs.entityType, entityType), eq(actionLogs.entityId, entityId)))
    .orderBy(desc(actionLogs.id))
    .limit(1);
  return entry!;
}
async function changeTitle(id: number, title: string) {
  await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: id,
    operation: 'update',
    actor,
    execute: (tx) => tx.update(products).set({ title }).where(eq(products.id, id)),
  });
  return latest('products', id);
}

it('keeps a new edit undoable after Undo, retires only the abandoned redo, and supports subsequent Undo/Redo', async () => {
  const p = await product();
  const abandoned = await changeTitle(p.id, 'Abandoned');
  await applyHistoryAction(db, { actionLogId: abandoned.id, direction: 'undo', actor });
  const current = await changeTitle(p.id, 'Current');
  expect((await loadActionHistoryDetail(db, current.id))?.recovery.nextAction).toBe('undo');
  expect((await loadActionHistoryDetail(db, abandoned.id))?.recovery.blockedReason).toBe(
    'non_reversible',
  );
  await applyHistoryAction(db, { actionLogId: current.id, direction: 'undo', actor });
  await expect(
    applyHistoryAction(db, { actionLogId: abandoned.id, direction: 'redo', actor }),
  ).rejects.toThrow('cannot be redone');
  await applyHistoryAction(db, { actionLogId: current.id, direction: 'redo', actor });
  expect((await db.select().from(products).where(eq(products.id, p.id)))[0]?.title).toBe('Current');
  expect(
    await db
      .select()
      .from(actionLogs)
      .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, p.id))),
  ).toHaveLength(2);
});

it('reconciles an existing branched history before Undo so its abandoned redo cannot reappear', async () => {
  const p = await product();
  const abandoned = await changeTitle(p.id, 'Abandoned');
  await applyHistoryAction(db, { actionLogId: abandoned.id, direction: 'undo', actor });
  const current = await changeTitle(p.id, 'Current');
  // Existing releases left this old branch marked reversible.
  await db.update(actionLogs).set({ isReversible: true }).where(eq(actionLogs.id, abandoned.id));
  await applyHistoryAction(db, { actionLogId: current.id, direction: 'undo', actor });
  expect((await loadActionHistoryDetail(db, abandoned.id))?.recovery.blockedReason).toBe(
    'non_reversible',
  );
  await applyHistoryAction(db, { actionLogId: current.id, direction: 'redo', actor });
});

it('rejects category Redo that would create a cycle while preserving both categories and the undone action', async () => {
  const a = await category(),
    b = await category();
  const move = async (id: number, parentId: number) => {
    await mutateEntityWithHistory(db, {
      entityType: 'categories',
      entityId: id,
      operation: 'update',
      actor,
      execute: (tx) => tx.update(categories).set({ parentId }).where(eq(categories.id, id)),
    });
    return latest('categories', id);
  };
  const moveA = await move(a.id, b.id);
  await applyHistoryAction(db, { actionLogId: moveA.id, direction: 'undo', actor });
  await move(b.id, a.id);
  await expect(
    applyHistoryAction(db, { actionLogId: moveA.id, direction: 'redo', actor }),
  ).rejects.toThrow('descendants');
  expect(
    (await db.select().from(categories).where(eq(categories.id, a.id)))[0]?.parentId,
  ).toBeNull();
  expect((await db.select().from(categories).where(eq(categories.id, b.id)))[0]?.parentId).toBe(
    a.id,
  );
  expect((await latest('categories', a.id)).isUndone).toBe(true);
});

it('recovers an approved AI category assignment through complete product snapshots and supports legacy category-only records', async () => {
  const p = await product(),
    c = await category();
  const [run] = await db
    .insert(aiRuns)
    .values({
      surface: 'admin',
      task: 'admin_chat',
      status: 'completed',
      model: 'test',
      promptVersion: 'test',
    })
    .returning();
  runIds.push(run!.id);
  const proposal = await proposeProductCategoryAssignment({
    productId: p.id,
    categoryId: c.id,
    actorId: actor.email,
    reasoning: 'Fixture assignment',
    runId: run!.id,
    sourceUpdatedAt: p.updatedAt,
    categoryUpdatedAt: c.updatedAt,
    confidence: 1,
  });
  await reviewProductCategoryProposal({
    proposalId: proposal.id,
    action: 'approve',
    actorId: actor.email,
  });
  const entry = await latest('products', p.id);
  expect(entry.beforeState).toMatchObject({
    aggregateVersion: 1,
    categoryId: null,
    promoCodes: [],
  });
  expect(entry.afterState).toMatchObject({ aggregateVersion: 1, categoryId: c.id });
  await applyHistoryAction(db, { actionLogId: entry.id, direction: 'undo', actor });
  expect((await db.select().from(products).where(eq(products.id, p.id)))[0]?.categoryId).toBeNull();
  await applyHistoryAction(db, { actionLogId: entry.id, direction: 'redo', actor });
  // The previous writer stored only the row: this exact scalar change remains safe.
  const plain = (snapshot: unknown) =>
    Object.fromEntries(
      Object.entries(snapshot as Record<string, unknown>).filter(
        ([key]) =>
          !['aggregateVersion', 'promoCodes', 'slugHistory', 'landingPageSlugs'].includes(key),
      ),
    );
  await db
    .update(actionLogs)
    .set({ beforeState: plain(entry.beforeState), afterState: plain(entry.afterState) })
    .where(eq(actionLogs.id, entry.id));
  await applyHistoryAction(db, { actionLogId: entry.id, direction: 'undo', actor });
  expect((await db.select().from(products).where(eq(products.id, p.id)))[0]?.categoryId).toBeNull();
});

it('recognizes actual partial inventory commits as mutation evidence while preserving failed quantities', async () => {
  const enough = await product(10),
    shortage = await product(1);
  const receipt = await adjustAdminInventory(
    {
      mode: 'decrease',
      items: [
        { productId: enough.id, quantity: 2 },
        { productId: shortage.id, quantity: 3 },
      ],
    },
    actor,
  );
  expect(receipt.ok).toBe(false);
  expect(adminAiToolConfirmsCompletedMutation('adjust_inventory', receipt)).toBe(true);
  const rows = await db
    .select()
    .from(products)
    .where(inArray(products.id, [enough.id, shortage.id]));
  expect(rows.find((row) => row.id === enough.id)?.inventoryQuantity).toBe(8);
  expect(rows.find((row) => row.id === shortage.id)?.inventoryQuantity).toBe(1);
});

it('serializes a concurrent edit before Redo without locking the old action ahead of its entity', async () => {
  const p = await product();
  const abandoned = await changeTitle(p.id, 'Abandoned');
  await applyHistoryAction(db, { actionLogId: abandoned.id, direction: 'undo', actor });
  let redo: Promise<unknown> | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '750ms'`);
      await tx.execute(sql`select id from ${products} where id = ${p.id} for update`);
      const [{ pid }] = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`))
        .rows;
      redo = applyHistoryAction(db, { actionLogId: abandoned.id, direction: 'redo', actor }).then(
        () => null,
        (error) => error,
      );
      await vi.waitFor(
        async () => {
          const blocked = await db.execute(
            sql`select pid from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`,
          );
          expect(blocked.rows.length).toBeGreaterThan(0);
        },
        { timeout: 3000, interval: 10 },
      );
      await mutateEntityWithHistoryTransaction(tx, {
        entityType: 'products',
        entityId: p.id,
        operation: 'update',
        actor,
        execute: (writer) =>
          writer.update(products).set({ title: 'Concurrent edit' }).where(eq(products.id, p.id)),
      });
    });
    expect(await redo).toBeInstanceOf(Error);
    expect(((await redo) as Error).message).toContain('cannot be redone');
    expect((await db.select().from(products).where(eq(products.id, p.id)))[0]?.title).toBe(
      'Concurrent edit',
    );
  } finally {
    await redo;
  }
});
