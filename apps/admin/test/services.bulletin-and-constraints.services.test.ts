import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  bulletinPostAttachments,
  bulletinPostReactions,
  bulletinPosts,
  bulletinPostTags,
  bulletinReplies,
  bulletinReplyReactions,
  bulletinTags,
  orderLineItems,
  orders,
  products,
} from '@bric/db/schema';
import { applyRateLimit } from '@bric/runtime/rate-limit';
import { getRedis } from '@bric/runtime/redis';

import { applyHistoryAction, getActionEntityConfig } from '../lib/action-history';
import { queryAdminOrders } from '../lib/admin-ai-order-query';
import { loadOrdersPageData } from '../lib/admin-orders-data';
import {
  createBulletinReply,
  deleteBulletinPost,
  setBulletinPostReaction,
  setBulletinReplyReaction,
} from '../lib/bulletin-mutations';
import { getReportingDb } from '../lib/reporting-db';

vi.mock('../lib/server-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));
vi.mock('../lib/storefront-revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/storefront-revalidate')>()),
  revalidateStorefrontProducts: vi.fn(),
}));

const runId = randomUUID();

describe('real PostgreSQL and Redis contracts', () => {
  afterAll(async () => {
    await Promise.allSettled([getRedis().quit(), getPool().end(), getReportingDb().$client.end()]);
  });

  it('records and undoes created bulletin child IDs instead of their different parent IDs', async () => {
    const db = getDb();
    const actor = { email: `identity-${runId}@example.com`, name: 'Audit' };
    const parentId = 1_500_000_000 + Math.floor(Math.random() * 100_000);
    const [post] = await db
      .insert(bulletinPosts)
      .values({
        id: parentId,
        title: runId,
        body: 'identity',
        authorName: actor.name,
        authorEmail: actor.email,
      })
      .returning();
    try {
      await createBulletinReply(db, post!.id, { body: 'Created reply' }, actor);
      const [createdReply] = await db
        .select()
        .from(bulletinReplies)
        .where(eq(bulletinReplies.postId, post!.id));
      expect(createdReply!.id).not.toBe(post!.id);
      const [parentReply] = await db
        .insert(bulletinReplies)
        .values({
          id: parentId + 1,
          postId: post!.id,
          body: 'Parent reply',
          authorName: actor.name,
          authorEmail: actor.email,
        })
        .returning();
      await setBulletinPostReaction(db, post!.id, '👍', 'add', actor);
      await setBulletinReplyReaction(db, parentReply!.id, '👍', 'add', actor);
      const [postReaction] = await db
        .select()
        .from(bulletinPostReactions)
        .where(eq(bulletinPostReactions.postId, post!.id));
      const [replyReaction] = await db
        .select()
        .from(bulletinReplyReactions)
        .where(eq(bulletinReplyReactions.replyId, parentReply!.id));
      for (const [entityType, entityId, parent] of [
        ['bulletinReplies', createdReply!.id, post!.id],
        ['bulletinPostReactions', postReaction!.id, post!.id],
        ['bulletinReplyReactions', replyReaction!.id, parentReply!.id],
      ] as const) {
        expect(entityId).not.toBe(parent);
        const [entry] = await db
          .select()
          .from(actionLogs)
          .where(and(eq(actionLogs.entityType, entityType), eq(actionLogs.createdBy, actor.email)));
        expect(entry!.entityId).toBe(entityId);
        await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo', actor });
        expect(
          (await getActionEntityConfig(entityType)!.fetchState?.(db, entityId)) ?? null,
        ).toBeNull();
      }
      expect(
        await db
          .select()
          .from(bulletinPostReactions)
          .where(eq(bulletinPostReactions.postId, post!.id)),
      ).toEqual([]);
      expect(
        await db
          .select()
          .from(bulletinReplyReactions)
          .where(eq(bulletinReplyReactions.replyId, parentReply!.id)),
      ).toEqual([]);
      expect(
        (await db.select().from(bulletinReplies).where(eq(bulletinReplies.id, parentReply!.id)))[0]
          ?.id,
      ).toBe(parentReply!.id);
    } finally {
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
      await db.delete(bulletinPosts).where(eq(bulletinPosts.id, post!.id));
    }
  });

  it('restores a deleted bulletin post with tags, attachments, replies and reactions, then redoes deletion', async () => {
    const db = getDb();
    const actor = {
      email: `audit-${runId}@example.com`,
      name: 'Audit',
      permissions: ['bulletin_moderate'] as const,
    };
    const [post] = await db
      .insert(bulletinPosts)
      .values({ title: runId, body: 'handoff', authorName: actor.name, authorEmail: actor.email })
      .returning();
    const [tag] = await db.insert(bulletinTags).values({ name: runId, slug: runId }).returning();
    try {
      await db.insert(bulletinPostTags).values({ postId: post!.id, tagId: tag!.id });
      await db.insert(bulletinPostAttachments).values({
        postId: post!.id,
        fileName: 'handoff.txt',
        fileKey: `bulletin/${runId}`,
        fileUrl: '/api/bulletin/attachments/test',
        contentType: 'text/plain',
        size: 7,
      });
      const [reply] = await db
        .insert(bulletinReplies)
        .values({
          postId: post!.id,
          body: 'received',
          authorName: actor.name,
          authorEmail: actor.email,
        })
        .returning();
      await db
        .insert(bulletinPostReactions)
        .values({ postId: post!.id, userName: actor.name, userEmail: actor.email, emoji: '👍' });
      await db
        .insert(bulletinReplyReactions)
        .values({ replyId: reply!.id, userName: actor.name, userEmail: actor.email, emoji: '👍' });
      const config = getActionEntityConfig('bulletinPosts')!;
      const before = await config.fetchState!(db, post!.id);
      await deleteBulletinPost(db, post!.id, actor);
      const [action] = await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'bulletinPosts'), eq(actionLogs.entityId, post!.id)));
      expect(await config.fetchState!(db, post!.id)).toBeNull();
      await applyHistoryAction(db, { actionLogId: action!.id, direction: 'undo', actor });
      expect(await config.fetchState!(db, post!.id)).toEqual(before);
      await applyHistoryAction(db, { actionLogId: action!.id, direction: 'redo', actor });
      expect(await config.fetchState!(db, post!.id)).toBeNull();
    } finally {
      await db
        .delete(actionLogs)
        .where(and(eq(actionLogs.entityType, 'bulletinPosts'), eq(actionLogs.entityId, post!.id)));
      await db.delete(bulletinPosts).where(eq(bulletinPosts.id, post!.id));
      await db.delete(bulletinTags).where(eq(bulletinTags.id, tag!.id));
    }
  });

  it('searches saved and current product identities without duplicating orders or grouped units', async () => {
    const db = getDb();
    const marker = `search-${runId}`;
    const [product] = await db
      .insert(products)
      .values({
        title: `Équilibreur ${marker}`,
        titleAr: `حامل محرك ${marker}`,
        sku: `TC0725-${runId}`,
        slug: `renamed-${marker}`,
        price: '100.00',
      })
      .returning();
    const fixtures = await db
      .insert(orders)
      .values([
        { phoneNumber1: '0550000001' },
        { phoneNumber1: '0550000002' },
        { phoneNumber1: '0550000003', note: marker },
      ])
      .returning();
    const [first, second, unrelated] = fixtures;
    try {
      await db.insert(orderLineItems).values(
        [
          {
            orderId: first!.id,
            productId: product!.id,
            contentId: 'current',
            titleSnapshot: `Old title ${marker}`,
            quantity: 2,
          },
          {
            orderId: first!.id,
            productId: null,
            contentId: 'deleted',
            titleSnapshot: `Équilibreur ${marker}`,
            quantity: 3,
          },
          {
            orderId: second!.id,
            productId: product!.id,
            contentId: 'current',
            titleSnapshot: `Old title ${marker}`,
            quantity: 1,
          },
        ].map((line) => ({
          ...line,
          rawValue: line.contentId,
          originalUnitPrice: '100.00',
          effectiveUnitPrice: '100.00',
          lineTotal: String(line.quantity * 100),
        })),
      );

      for (const search of [`equilibreUR ${marker}`, `حامل محرك ${marker}`, product!.sku!]) {
        const result = await queryAdminOrders({ search, limit: 1 });
        expect(result.pagination.totalItems).toBe(2);
        expect(result.items).toHaveLength(1);
        const next = await queryAdminOrders({ search, limit: 1, page: 2 });
        expect(
          new Set([...result.items, ...next.items].map((row) => ('id' in row ? row.id : null))),
        ).toEqual(new Set([first!.id, second!.id]));
      }
      const grouped = await queryAdminOrders({
        search: `equilibreur ${marker}`,
        groupBy: { dimension: 'product' },
      });
      expect(grouped).toMatchObject({
        matchedOrders: 2,
        items: expect.arrayContaining([
          expect.objectContaining({ productId: product!.id, orderCount: 2, units: 3 }),
          expect.objectContaining({ productId: null, orderCount: 1, units: 3 }),
        ]),
      });
      const page = await loadOrdersPageData({ search: `equilibreur ${marker}` }, false);
      expect(page.items.map((row) => row.id).sort()).toEqual([first!.id, second!.id].sort());
      const note = await queryAdminOrders({ search: marker });
      expect(note.pagination.totalItems).toBe(3);
      expect(note.items).toContainEqual(expect.objectContaining({ id: unrelated!.id }));
      const absent = await queryAdminOrders({ search: `absent-${marker}` });
      expect(absent.pagination.totalItems).toBe(0);

      await db.delete(products).where(eq(products.id, product!.id));
      const deleted = await queryAdminOrders({ search: `equilibreur ${marker}` });
      expect(deleted.pagination.totalItems).toBe(1);
      expect(deleted.items).toContainEqual(expect.objectContaining({ id: first!.id }));
    } finally {
      await db.delete(orders).where(
        inArray(
          orders.id,
          fixtures.map((row) => row.id),
        ),
      );
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('applies migrations to a queryable PostgreSQL schema', async () => {
    const result = await getPool().query<{
      products: string | null;
      migrations: string | null;
      analyticsCategoryIndex: string | null;
      metaAnalyticsEventIndex: string | null;
    }>(`
      select
        to_regclass('public.products')::text as products,
        to_regclass('drizzle.__drizzle_migrations')::text as migrations,
        to_regclass('public.idx_analytics_events_category')::text as "analyticsCategoryIndex",
        to_regclass('public.idx_meta_event_outbox_analytics_event')::text as "metaAnalyticsEventIndex"
    `);

    expect(result.rows[0]).toEqual({
      products: 'products',
      migrations: 'drizzle.__drizzle_migrations',
      analyticsCategoryIndex: 'idx_analytics_events_category',
      metaAnalyticsEventIndex: 'idx_meta_event_outbox_analytics_event',
    });
  });

  it('keeps stable catalog values protected by database constraints', async () => {
    const expected = [
      'products_availability_matches_stock_check',
      'products_availability_status_check',
      'products_inventory_quantity_nonnegative_check',
      'products_old_price_nonnegative_check',
      'products_price_nonnegative_check',
      'products_purchase_price_nonnegative_check',
      'products_units_sold_nonnegative_check',
    ];
    const result = await getPool().query<{ conname: string }>(
      `select conname from pg_constraint where conname = any($1::text[]) order by conname`,
      [expected],
    );

    expect(result.rows.map((row) => row.conname)).toEqual(expected);
  });

  it('rejects product availability that contradicts stock state', async () => {
    await expect(
      getPool().query(
        `insert into products (title, slug, price, in_stock, availability_status)
         values ($1, $2, $3, true, 'out_of_stock')`,
        ['Contradictory stock fixture', `contradictory-stock-${runId}`, '100.00'],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'products_availability_matches_stock_check',
    });
  });

  it('enforces rate-limit counters in Redis', async () => {
    const options = {
      scope: `service-test:${runId}`,
      key: 'rate-limit',
      limit: 1,
      windowSeconds: 60,
    };

    await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: true, remaining: 0 });
    await expect(applyRateLimit(options)).resolves.toMatchObject({ ok: false, remaining: 0 });
  });
});
