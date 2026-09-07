import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  orderLineItems,
  orders,
  productPromoCodes,
  products,
  shoppingListDrafts,
} from '@bric/db/schema';
import { getRedis } from '@bric/runtime/redis';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import { createStorefrontOrder } from '@bric/storefront-core/orders';

import { getAnalyticsSnapshot } from '../lib/analytics-snapshots';
import { getReportingDb } from '../lib/reporting-db';

import { buildGeneratedShoppingListDraft } from '../lib/shopping-list-drafts';
import {
  resetAdminShoppingListDraft,
  saveAdminShoppingListDraft,
  ShoppingListDraftConflictError,
} from '../lib/shopping-list-drafts.server';
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

  it('queues snapshot queries separately from interactive reads with two nonparallel connections', async () => {
    const reporting = getReportingDb();
    const held = await Promise.all([reporting.$client.connect(), reporting.$client.connect()]);
    const computation = getAnalyticsSnapshot(
      { view: 'storefront', range: '7d', grain: 'auto' },
      { refresh: true, remember: false },
    );
    try {
      await vi.waitFor(() => expect(reporting.$client.waitingCount).toBeGreaterThan(0));
      expect(reporting.$client.totalCount).toBe(2);
      const interactive = await getDb().execute(sql`select 42 as value`);
      expect(interactive.rows).toEqual([{ value: 42 }]);
    } finally {
      held.forEach((connection) => connection.release());
    }
    const result = await computation;
    expect(result.filters.range).toBe('7d');
    expect(result.data.kind).toBe('storefront');
    const settings = await reporting.execute(sql`
      select current_setting('max_parallel_workers_per_gather') as parallel,
        current_setting('application_name') as application
    `);
    expect(settings.rows).toEqual([{ parallel: '0', application: 'bric-admin-reporting' }]);
    const analytics = await getAnalyticsSnapshot(
      { view: 'storefront', range: '7d', grain: 'auto' },
      { refresh: true, remember: false },
    );
    expect(analytics.diagnostics.cache?.state).toBe('miss');
    expect(reporting.$client.totalCount).toBe(2);
  });

  it('saves loads and resets a thousand-order selected scope with a bounded database identity', async () => {
    const { loadAdminShoppingListDraft } = await import('../lib/shopping-list-drafts.server');
    const { buildShoppingListScopeKey } = await import('../lib/shopping-list-drafts');
    const db = getDb();
    const created = await db
      .insert(orders)
      .values(
        Array.from({ length: 1000 }, (_, i) => ({
          firstName: `${runId}-scope-${i}`,
          phoneNumber1: '0661920628',
        })),
      )
      .returning({ id: orders.id });
    const ids = created.map(({ id }) => id);
    const scopeKey = buildShoppingListScopeKey('selected', ids);
    try {
      const generated = await buildGeneratedShoppingListDraft({
        sourceMode: 'selected',
        title: `${runId}-large-selection`,
        orders: ids.map((id) => ({
          id,
          fullName: 'Large selection',
          note: null,
          orderProducts: [],
        })),
        resolveProductDetails: async () => null,
        resolveBrandName: async () => 'Unbranded',
      });
      const saved = await saveAdminShoppingListDraft(db, { ...generated, revision: null });
      expect(saved.scopeKey).toBe(scopeKey);
      expect(saved.scopeKey).toHaveLength(80);
      const loaded = await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [...ids].reverse(),
      });
      expect(loaded?.orderIds).toEqual([...ids].sort((a, b) => a - b));
      expect(loaded?.orders).toHaveLength(1000);
      const reset = await resetAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: ids,
        revision: saved.revision,
      });
      expect(reset.scopeKey).toBe(scopeKey);
      expect(reset.orderIds).toEqual(saved.orderIds);
      expect(reset.revision).toBe(saved.revision + 1);
      await expect(
        resetAdminShoppingListDraft(db, {
          sourceMode: 'selected',
          orderIds: ids,
          revision: saved.revision,
        }),
      ).rejects.toBeInstanceOf(ShoppingListDraftConflictError);
    } finally {
      await db.delete(shoppingListDrafts).where(eq(shoppingListDrafts.scopeKey, scopeKey));
      await db.delete(orders).where(inArray(orders.id, ids));
    }
  });

  it('preserves multiple product offers through public order creation and operator repricing', async () => {
    const { updateAdminOrder } = await import('../lib/admin-order-update');
    const { resolveOrderCommercialState, UnorderableCartError } =
      await import('@bric/storefront-core/order-commercial');
    const db = getDb();
    const catalog = await db
      .insert(products)
      .values([
        {
          title: `${runId}-offer-a`,
          slug: `${runId}-offer-a`,
          price: '1000',
          active: true,
          inStock: true,
        },
        {
          title: `${runId}-offer-b`,
          slug: `${runId}-offer-b`,
          price: '2000',
          active: true,
          inStock: true,
        },
      ])
      .returning();
    const a = catalog[0]!.id,
      b = catalog[1]!.id;
    const productPromos = [
      { productId: a, code: 'SHARED' },
      { productId: b, code: 'B' },
    ];
    const createdIds: number[] = [];
    await db.insert(productPromoCodes).values([
      { productId: a, code: 'SHARED', normalizedCode: 'shared', promoPrice: '800' },
      { productId: b, code: 'B', normalizedCode: 'b', promoPrice: '1500' },
      { productId: b, code: 'SHARED', normalizedCode: 'shared', promoPrice: '1' },
    ]);
    try {
      for (const cartProducts of [
        [String(a), String(b)],
        [String(b), String(a)],
      ]) {
        const { item: order } = await createStorefrontOrder(
          db,
          storefrontOrderCreateRequestSchema.parse({
            phoneNumber1: '0550000991',
            cartProducts,
            productPromos,
            expectedProductSubtotal: 2300,
          }),
        );
        createdIds.push(order.id);
        expect(order.productSubtotal).toBe(2300);
        expect(order.productPromos).toEqual(expect.arrayContaining(productPromos));
        expect(order.orderProducts.map((line) => line.unitPrice).sort((x, y) => x - y)).toEqual([
          800, 1500,
        ]);
      }
      const updated = await updateAdminOrder(
        db,
        createdIds[0]!,
        { cartProducts: [String(a), String(b), String(b)] },
        { email: `offers-${runId}@example.com` },
      );
      expect(updated.productSubtotal).toBe(3800);
      const [stored] = await db.select().from(orders).where(eq(orders.id, createdIds[0]!));
      expect(stored!.productPromos).toEqual(expect.arrayContaining(productPromos));
      expect(Number(stored!.productSubtotal)).toBe(3800);
      const lines = await db
        .select()
        .from(orderLineItems)
        .where(eq(orderLineItems.orderId, createdIds[0]!));
      expect(lines.find((line) => line.productId === b)).toMatchObject({
        quantity: 2,
        effectiveUnitPrice: '1500.00',
        discountAmount: '1000.00',
      });
      await db
        .update(productPromoCodes)
        .set({ active: false })
        .where(and(eq(productPromoCodes.productId, b), eq(productPromoCodes.normalizedCode, 'b')));
      await expect(
        createStorefrontOrder(
          db,
          storefrontOrderCreateRequestSchema.parse({
            phoneNumber1: '0550000991',
            cartProducts: [String(a), String(b)],
            productPromos,
            expectedProductSubtotal: 2300,
          }),
        ),
      ).rejects.toBeInstanceOf(UnorderableCartError);
      const wrongPair = await resolveOrderCommercialState(db, {
        cartProducts: [String(a)],
        productPromos: [{ productId: a, code: 'B' }],
        requireOrderable: true,
      });
      expect(wrongPair.productSubtotal).toBe(1000);
      expect(wrongPair.productPromos).toEqual([]);
    } finally {
      if (createdIds.length) await db.delete(orders).where(inArray(orders.id, createdIds));
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, `offers-${runId}@example.com`));
      await db.delete(products).where(inArray(products.id, [a, b]));
    }
  });
});
