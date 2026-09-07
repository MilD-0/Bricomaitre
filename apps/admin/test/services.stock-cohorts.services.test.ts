import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  adminMutationIdempotency,
  orderLineItems,
  orders,
  products,
  shoppingListDrafts,
} from '@bric/db/schema';
import { getRedis } from '@bric/runtime/redis';

import { getReportingDb } from '../lib/reporting-db';

import {
  buildGeneratedShoppingListDraft,
  mergeShoppingListDraft,
} from '../lib/shopping-list-drafts';
import {
  resetAdminShoppingListDraft,
  saveAdminShoppingListDraft,
} from '../lib/shopping-list-drafts.server';
import { applyShoppingListInventory } from '../lib/shopping-list-inventory.server';
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

  it('deducts overlapping order requirements once while keeping manual extras scoped', async () => {
    const { orderInventoryAllocations } = await import('@bric/db/schema');
    const { loadAdminShoppingListDraft } = await import('../lib/shopping-list-drafts.server');
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        title: `overlap-${runId}`,
        slug: `overlap-${runId}`,
        price: '10',
        inventoryQuantity: 50,
      })
      .returning();
    const created = await db
      .insert(orders)
      .values([1, 2, 3].map((i) => ({ firstName: `${runId}-${i}`, phoneNumber1: '0661920628' })))
      .returning();
    const ids = created.map((order) => order.id);
    const scopes: string[] = [];
    const requests: string[] = [];
    const build = async (
      orderIds: number[],
      sourceMode: 'selected' | 'posted' | 'dispatched' = 'selected',
    ) =>
      buildGeneratedShoppingListDraft({
        sourceMode,
        title: `overlap-${runId}`,
        orders: orderIds.map((id) => ({
          id,
          fullName: 'Overlap',
          note: null,
          orderProducts: [
            {
              productId: product!.id,
              rawValue: String(product!.id),
              title: product!.title,
              quantity: 2,
              unitPrice: 10,
              lineTotal: 20,
              thumbnailUrl: null,
              missing: false,
            },
          ],
        })),
        resolveProductDetails: async () => ({ inventoryQuantity: 50, purchasePrice: null }),
        resolveBrandName: async () => 'Unbranded',
      });
    const save = async (
      orderIds: number[],
      sourceMode: 'selected' | 'posted' | 'dispatched' = 'selected',
    ) => {
      const d = await saveAdminShoppingListDraft(db, {
        ...(await build(orderIds, sourceMode)),
        revision: null,
      });
      scopes.push(d.scopeKey);
      return d;
    };
    const apply = async (d: Awaited<ReturnType<typeof save>>) => {
      const requestId = randomUUID();
      requests.push(requestId);
      return applyShoppingListInventory(db, {
        sourceMode: d.sourceMode,
        orderIds: d.orderIds,
        revision: d.revision,
        draftIds: d.draftItems.map((item) => item.draftId),
        requestId,
      });
    };
    try {
      await db.insert(orderLineItems).values(
        ids.map((orderId) => ({
          orderId,
          productId: product!.id,
          contentId: String(product!.id),
          rawValue: String(product!.id),
          titleSnapshot: product!.title,
          originalUnitPrice: '10',
          effectiveUnitPrice: '10',
          quantity: 2,
          lineTotal: '20',
        })),
      );
      let a = await save([ids[0]!]);
      a = await saveAdminShoppingListDraft(db, {
        ...a,
        draftItems: a.draftItems.map((item) => ({ ...item, inventoryDecreaseQuantity: 1 })),
      });
      await apply(a);
      const ab = await save([ids[0]!, ids[1]!]);
      const bc = await save([ids[1]!, ids[2]!]);
      const concurrent = await Promise.all([apply(ab), apply(bc)]);
      expect(
        concurrent.reduce(
          (sum, result) =>
            sum +
            result.items.reduce((n, item) => n + item.previousQuantity - item.nextQuantity, 0),
          0,
        ),
      ).toBe(5);
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!
          .inventoryQuantity,
      ).toBe(44);
      expect(
        (
          await db
            .select()
            .from(orderInventoryAllocations)
            .where(inArray(orderInventoryAllocations.orderId, ids))
        ).map((row) => row.quantity),
      ).toEqual([2, 2, 2]);
      for (const sourceMode of ['posted', 'dispatched'] as const) {
        const [existing] = await db
          .select()
          .from(shoppingListDrafts)
          .where(eq(shoppingListDrafts.scopeKey, `status:${sourceMode}`));
        if (existing) continue;
        const status = await save(ids, sourceMode);
        expect((await apply(status)).items).toEqual([]);
      }
      let reloaded = (await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!],
      }))!;
      expect(reloaded.draftItems[0]!.inventoryQuantity).toBe(44);
      reloaded = await saveAdminShoppingListDraft(db, {
        ...reloaded,
        draftItems: reloaded.draftItems.map((item) => ({
          ...item,
          quantity: 3,
          inventoryDecreaseQuantity: 1,
        })),
      });
      const extra = await apply(reloaded);
      expect(extra.items[0]).toMatchObject({ previousQuantity: 44, nextQuantity: 43 });
      expect(extra.draft.generatedItems[0]).toMatchObject({
        inventoryOrderAppliedQuantity: 2,
        inventoryManualAppliedQuantity: 1,
      });
      const reset = await resetAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!],
        revision: extra.draft.revision,
      });
      expect((await apply(reset)).items).toEqual([]);
      await db
        .update(orderLineItems)
        .set({ quantity: 3, lineTotal: '30' })
        .where(and(eq(orderLineItems.orderId, ids[1]!), eq(orderLineItems.productId, product!.id)));
      const edited = await save([ids[1]!]);
      const increased = await saveAdminShoppingListDraft(db, {
        ...edited,
        draftItems: edited.draftItems.map((item) => ({
          ...item,
          quantity: 3,
          inventoryDecreaseQuantity: 1,
        })),
      });
      expect((await apply(increased)).items[0]).toMatchObject({
        previousQuantity: 43,
        nextQuantity: 42,
      });
      await db.delete(orders).where(eq(orders.id, ids[0]!));
      const deletedOrderDraft = (await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!],
      }))!;
      expect((await apply(deletedOrderDraft)).items).toEqual([]);
      expect(
        (
          await db
            .select()
            .from(orderInventoryAllocations)
            .where(eq(orderInventoryAllocations.orderId, ids[0]!))
        )[0]!.quantity,
      ).toBe(2);
    } finally {
      if (scopes.length)
        await db.delete(shoppingListDrafts).where(inArray(shoppingListDrafts.scopeKey, scopes));
      if (requests.length)
        await db
          .delete(adminMutationIdempotency)
          .where(inArray(adminMutationIdempotency.requestId, requests));
      await db
        .delete(actionLogs)
        .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
      await db.delete(orders).where(inArray(orders.id, ids));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('refreshes changing status cohorts and applies each order product only once', async () => {
    const { orderInventoryAllocations } = await import('@bric/db/schema');
    const rollback = new Error('shopping refresh fixture rollback');
    await expect(
      getDb().transaction(async (tx) => {
        const db = tx as unknown as ReturnType<typeof getDb>;
        // Isolate this status scope inside a transaction that always rolls back.
        await tx
          .delete(shoppingListDrafts)
          .where(eq(shoppingListDrafts.scopeKey, 'status:confirmed'));
        const [product] = await tx
          .insert(products)
          .values({
            title: `Refresh ${runId}`,
            slug: `refresh-${runId}`,
            price: '10',
            inventoryQuantity: 20,
          })
          .returning();
        const cohort = await tx
          .insert(orders)
          .values(
            [1, 2, 3].map((i) => ({
              firstName: `refresh-${runId}-${i}`,
              phoneNumber1: '0661920628',
            })),
          )
          .returning();
        await tx.insert(orderLineItems).values(
          cohort.map((order) => ({
            orderId: order.id,
            productId: product!.id,
            contentId: String(product!.id),
            rawValue: String(product!.id),
            titleSnapshot: product!.title,
            originalUnitPrice: '10',
            effectiveUnitPrice: '10',
            quantity: 2,
            lineTotal: '20',
          })),
        );
        const generate = (ids: number[]) =>
          buildGeneratedShoppingListDraft({
            sourceMode: 'confirmed',
            title: 'Refresh verification',
            orders: ids.map((id) => ({
              id,
              fullName: 'Refresh',
              note: null,
              orderProducts: [
                {
                  productId: product!.id,
                  rawValue: String(product!.id),
                  title: product!.title,
                  quantity: 2,
                  unitPrice: 10,
                  lineTotal: 20,
                  thumbnailUrl: null,
                  missing: false,
                },
              ],
            })),
            resolveProductDetails: async () => ({ inventoryQuantity: 20, purchasePrice: null }),
            resolveBrandName: async () => 'Unbranded',
          });
        let draft = await saveAdminShoppingListDraft(db, {
          ...(await generate([cohort[0]!.id])),
          revision: null,
        });
        const apply = () =>
          applyShoppingListInventory(db, {
            sourceMode: draft.sourceMode,
            orderIds: draft.orderIds,
            revision: draft.revision,
            draftIds: draft.draftItems.map((item) => item.draftId),
            requestId: randomUUID(),
          });
        draft = (await apply()).draft;
        expect(draft.draftItems[0]!.inventoryAppliedQuantity).toBe(2);
        const refresh = async (ids: number[]) => {
          draft = await saveAdminShoppingListDraft(db, {
            ...mergeShoppingListDraft(await generate(ids), draft),
            revision: draft.revision,
          });
        };
        await refresh([cohort[0]!.id, cohort[1]!.id]);
        expect(draft.draftItems[0]).toMatchObject({
          quantity: 4,
          inventoryAppliedQuantity: 2,
          inventoryDecreaseQuantity: 2,
        });
        const growth = await apply();
        expect(growth.items[0]).toMatchObject({ previousQuantity: 18, nextQuantity: 16 });
        draft = growth.draft;
        // Replace a consumed order with a new order, leaving total demand unchanged.
        await refresh([cohort[1]!.id, cohort[2]!.id]);
        expect(draft.orders.map((order) => order.orderId)).toEqual([cohort[1]!.id, cohort[2]!.id]);
        expect(draft.draftItems[0]).toMatchObject({
          quantity: 4,
          inventoryAppliedQuantity: 2,
          inventoryDecreaseQuantity: 2,
        });
        const replacement = await apply();
        expect(replacement.items[0]).toMatchObject({ previousQuantity: 16, nextQuantity: 14 });
        draft = replacement.draft;
        await refresh([cohort[1]!.id, cohort[2]!.id]);
        const repeat = await apply();
        expect(repeat.items).toEqual([]);
        draft = repeat.draft;
        await refresh([]);
        expect(draft.draftItems).toEqual([]);
        const [remaining] = await tx.select().from(products).where(eq(products.id, product!.id));
        expect(remaining!.inventoryQuantity).toBe(14);
        const allocations = await tx
          .select()
          .from(orderInventoryAllocations)
          .where(eq(orderInventoryAllocations.productId, product!.id));
        expect(allocations).toHaveLength(3);
        expect(allocations.every((allocation) => allocation.quantity === 2)).toBe(true);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
