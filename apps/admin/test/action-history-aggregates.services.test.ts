import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  assetBanners,
  categories,
  featuredProductGroups,
  featuredProductGroupProducts,
  landingPages,
  orderLineItems,
  orders,
  orderStatusHistory,
  productPromoCodes,
  products,
} from '@bric/db/schema';
import { resolveOrderCommercialState } from '@bric/storefront-core/order-commercial';
import { insertCanonicalOrder, updateCanonicalOrder } from '@bric/storefront-core/order-write';
import {
  applyHistoryAction,
  mutateEntityWithHistory,
  mutateEntityWithHistoryTransaction,
  ActionHistoryEntityNotFoundError,
} from '../lib/action-history';
import { replaceProductThroughCanonicalWorkflow } from '../lib/product-update-workflow';
import { reorderAdminAssets } from '../lib/asset-mutations';
import { createLandingPage } from '../lib/landing-pages';
vi.mock('../lib/storefront-revalidate', () => ({ revalidateStorefrontAssets: vi.fn() }));
const actor = { email: `recovery-${randomUUID()}@example.invalid` };
const db = getDb();
const productIds: number[] = [],
  orderIds: number[] = [],
  groupIds: number[] = [],
  bannerIds: number[] = [];
afterAll(async () => {
  await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
  if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
  if (groupIds.length)
    await db.delete(featuredProductGroups).where(inArray(featuredProductGroups.id, groupIds));
  if (bannerIds.length) await db.delete(assetBanners).where(inArray(assetBanners.id, bannerIds));
  if (productIds.length) {
    await db.delete(landingPages).where(inArray(landingPages.productId, productIds));
    await db.delete(products).where(inArray(products.id, productIds));
  }
  await getPool().end();
});
async function product() {
  const [row] = await db
    .insert(products)
    .values({ title: 'Recovery product', slug: randomUUID(), price: '1000' })
    .returning();
  productIds.push(row!.id);
  return row!;
}
async function recover(entityType: string, entityId: number, direction: 'undo' | 'redo') {
  const [entry] = await db
    .select()
    .from(actionLogs)
    .where(and(eq(actionLogs.entityType, entityType), eq(actionLogs.entityId, entityId)))
    .orderBy(desc(actionLogs.id))
    .limit(1);
  return applyHistoryAction(db, { actionLogId: entry!.id, direction, actor });
}

describe('aggregate action recovery', () => {
  it('waits for the hierarchy lock before taking category row locks', async () => {
    const [category] = await db
      .insert(categories)
      .values({ name: 'Lock ordering', slug: randomUUID() })
      .returning();
    let mutation: Promise<unknown> | undefined;
    try {
      await db.transaction(async (holder) => {
        await holder.execute(sql`select pg_advisory_xact_lock(42716421)`);
        const current = await holder.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        let signalStarted!: (pid: number) => void;
        const started = new Promise<number>((resolve) => {
          signalStarted = resolve;
        });
        mutation = db.transaction(async (tx) => {
          await tx.execute(sql`set local lock_timeout = '5s'`);
          const backend = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
          signalStarted(backend.rows[0]!.pid);
          return mutateEntityWithHistoryTransaction(tx, {
            entityType: 'categories',
            entityId: category!.id,
            operation: 'update',
            actor,
            execute: (executor) =>
              executor
                .update(categories)
                .set({ name: 'After lock' })
                .where(eq(categories.id, category!.id)),
          });
        });
        // Observe the mutation waiting on our hierarchy lock before testing its
        // row ownership. This avoids relying on relative query timing.
        const pending = mutation;
        pending.catch(() => undefined);
        const mutationPid = await started;
        await vi.waitFor(async () => {
          const blockers = await holder.execute<{ pids: number[] }>(
            sql`select pg_blocking_pids(${mutationPid}) as pids`,
          );
          expect(blockers.rows[0]!.pids).toContain(current.rows[0]!.pid);
        });
        await holder.execute(
          sql`select id from ${categories} where id = ${category!.id} for update nowait`,
        );
      });
      await mutation;
      expect(
        (await db.select().from(categories).where(eq(categories.id, category!.id)))[0]!.name,
      ).toBe('After lock');
    } finally {
      await mutation?.catch(() => undefined);
      await db.delete(categories).where(eq(categories.id, category!.id));
    }
  });

  it('restores commercial lines, status history and timestamp fields across edit and creation Undo/Redo', async () => {
    const first = await product();
    const second = await product();
    const created = await mutateEntityWithHistory(db, {
      entityType: 'orders',
      operation: 'create',
      actor,
      execute: async (tx) =>
        insertCanonicalOrder(tx, {
          commercial: await resolveOrderCommercialState(tx, { cartProducts: [String(first.id)] }),
          deliveryFee: 100,
          actor,
          values: {
            phoneNumber1: '0550123456',
            publicToken: randomUUID(),
            publicTokenExpiresAt: new Date(Date.now() + 86400000),
          },
        }),
      resolveEntityId: (result) => result.order.id,
    });
    const id = created.order.id;
    orderIds.push(id);
    await recover('orders', id, 'undo');
    expect(await db.select().from(orders).where(eq(orders.id, id))).toEqual([]);
    await recover('orders', id, 'redo');
    expect(
      (await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, id)))[0]?.productId,
    ).toBe(first.id);
    expect(
      await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)),
    ).toHaveLength(1);
    await mutateEntityWithHistory(db, {
      entityType: 'orders',
      entityId: id,
      operation: 'update',
      actor,
      execute: async (tx) =>
        updateCanonicalOrder(tx, {
          orderId: id,
          deliveryFee: 100,
          commercial: await resolveOrderCommercialState(tx, { cartProducts: [String(second.id)] }),
          actor,
          status: { value: 2 },
        }),
    });
    await recover('orders', id, 'undo');
    expect(
      (await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, id)))[0]?.productId,
    ).toBe(first.id);
    expect((await db.select().from(orders).where(eq(orders.id, id)))[0]?.inHouseStatus).toBe(0);
    expect(
      await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)),
    ).toHaveLength(1);
    await recover('orders', id, 'redo');
    expect(
      (await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, id)))[0]?.productId,
    ).toBe(second.id);
    expect(
      await db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, id)),
    ).toHaveLength(2);
  });

  it('restores product promotions and related slugs without reverting newer counters', async () => {
    const row = await product();
    await db.insert(productPromoCodes).values({
      productId: row.id,
      code: 'OLD',
      normalizedCode: 'OLD',
      promoPrice: '900',
      startsAt: new Date('2026-01-01Z'),
    });
    const page = await createLandingPage({ productId: row.id, locale: 'fr' });
    await db
      .update(landingPages)
      .set({ slug: `old-${row.slug}` })
      .where(eq(landingPages.id, page.id));
    await replaceProductThroughCanonicalWorkflow(
      db,
      row.id,
      {
        ...row,
        slug: `new-${row.slug}`,
        title: 'New title',
        price: 1200,
        promoCodes: [{ code: 'NEW', promoPrice: 1000, active: true }],
      },
      actor,
    );
    await db.update(products).set({ viewCount: 7 }).where(eq(products.id, row.id));
    await recover('products', row.id, 'undo');
    expect((await db.select().from(products).where(eq(products.id, row.id)))[0]).toMatchObject({
      slug: row.slug,
      price: '1000.00',
      viewCount: 7,
    });
    expect(
      (await db.select().from(productPromoCodes).where(eq(productPromoCodes.productId, row.id)))[0],
    ).toMatchObject({ code: 'OLD', startsAt: new Date('2026-01-01Z') });
    expect(
      (await db.select().from(landingPages).where(eq(landingPages.id, page!.id)))[0]?.slug,
    ).toBe(`old-${row.slug}`);
    await recover('products', row.id, 'redo');
    expect(
      (await db.select().from(productPromoCodes).where(eq(productPromoCodes.productId, row.id)))[0]
        ?.code,
    ).toBe('NEW');
  });

  it('restores featured group selections after deletion', async () => {
    const selected = await product();
    const [group] = await db
      .insert(featuredProductGroups)
      .values({ name: 'Recovery group' })
      .returning();
    groupIds.push(group!.id);
    await db
      .insert(featuredProductGroupProducts)
      .values({ groupId: group!.id, productId: selected.id });
    await mutateEntityWithHistory(db, {
      entityType: 'featuredProductGroups',
      entityId: group!.id,
      operation: 'delete',
      actor,
      execute: (tx) =>
        tx.delete(featuredProductGroups).where(eq(featuredProductGroups.id, group!.id)),
    });
    await recover('featuredProductGroups', group!.id, 'undo');
    expect(
      await db
        .select()
        .from(featuredProductGroupProducts)
        .where(eq(featuredProductGroupProducts.groupId, group!.id)),
    ).toEqual([{ groupId: group!.id, productId: selected.id }]);
    await recover('featuredProductGroups', group!.id, 'redo');
    expect(
      await db.select().from(featuredProductGroups).where(eq(featuredProductGroups.id, group!.id)),
    ).toEqual([]);
  });

  it('preserves a later reorder when undoing text, and rejects conflicting later text', async () => {
    const [banner] = await db
      .insert(assetBanners)
      .values({ title: 'Before', imageUrl: 'https://example.invalid/a.jpg' })
      .returning();
    bannerIds.push(banner!.id);
    await mutateEntityWithHistory(db, {
      entityType: 'assetBanners',
      entityId: banner!.id,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx.update(assetBanners).set({ title: 'After' }).where(eq(assetBanners.id, banner!.id)),
    });
    await reorderAdminAssets(db, { kind: 'banner', items: [{ id: banner!.id, sortOrder: 9 }] });
    await recover('assetBanners', banner!.id, 'undo');
    expect(
      (await db.select().from(assetBanners).where(eq(assetBanners.id, banner!.id)))[0],
    ).toMatchObject({ title: 'Before', sortOrder: 9 });
    await db
      .update(assetBanners)
      .set({ title: 'Newer edit' })
      .where(eq(assetBanners.id, banner!.id));
    await expect(recover('assetBanners', banner!.id, 'redo')).rejects.toThrow(
      'changed after this action',
    );
  });

  it('does not execute or log a mutation of a nonexistent row', async () => {
    const execute = vi.fn();
    await expect(
      mutateEntityWithHistory(db, {
        entityType: 'assetBanners',
        entityId: 8999999999999,
        operation: 'update',
        execute,
      }),
    ).rejects.toBeInstanceOf(ActionHistoryEntityNotFoundError);
    expect(execute).not.toHaveBeenCalled();
    expect(
      await db.select().from(actionLogs).where(eq(actionLogs.entityId, 8999999999999)),
    ).toEqual([]);
  });
});
