import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  adminMutationIdempotency,
  brands,
  categories,
  ecotrackOrderStates,
  orderLineItems,
  orders,
  products,
  shoppingListDrafts,
} from '@bric/db/schema';
import { getRedis } from '@bric/runtime/redis';

import { applyHistoryAction } from '../lib/action-history';
import { loadActiveShipmentPageRows } from '../lib/admin-ecotrack-shipment-view';
import { loadOrdersPageData } from '../lib/admin-orders-data';
import { parseEcotrackShipmentListQuery } from '../lib/ecotrack-shipment-list';
import { getReportingDb } from '../lib/reporting-db';

import { buildGeneratedShoppingListDraft } from '../lib/shopping-list-drafts';
import { saveAdminShoppingListDraft } from '../lib/shopping-list-drafts.server';
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

  it('preserves legacy deductions and lets an operator attribute ambiguous partials without changing stock', async () => {
    const { orderInventoryAllocations } = await import('@bric/db/schema');
    const { loadAdminShoppingListDraft } = await import('../lib/shopping-list-drafts.server');
    const {
      loadShoppingListAllocationReview,
      reconcileShoppingListAllocationReview,
      ShoppingListAllocationReviewError,
    } = await import('../lib/shopping-list-stock-allocations');
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        title: `legacy-${runId}`,
        slug: `legacy-${runId}`,
        price: '10',
        inventoryQuantity: 50,
      })
      .returning();
    const created = await db
      .insert(orders)
      .values(
        [1, 2, 3].map((i) => ({ firstName: `legacy-${runId}-${i}`, phoneNumber1: '0661920628' })),
      )
      .returning();
    const ids = created.map((order) => order.id);
    const scopes: string[] = [];
    const requests: string[] = [];
    const build = async (orderIds: number[]) =>
      buildGeneratedShoppingListDraft({
        sourceMode: 'selected',
        title: `legacy-${runId}`,
        orders: orderIds.map((id) => ({
          id,
          fullName: 'Legacy',
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
      for (const orderIds of [[ids[0]!, ids[1]!], [ids[2]!]]) {
        const draft = await build(orderIds);
        const scopeKey = `selected:${orderIds.join(',')}`;
        scopes.push(scopeKey);
        const applied = draft.draftItems.map((item) => ({ ...item, inventoryAppliedQuantity: 1 }));
        await db.insert(shoppingListDrafts).values({
          scopeKey,
          sourceMode: 'selected',
          orderIds,
          title: draft.title,
          generatedItems: draft.generatedItems,
          draftItems: applied,
          ordersSnapshot: draft.orders,
        });
      }
      const legacy = (await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!, ids[1]!],
      }))!;
      const single = (await loadAdminShoppingListDraft(db, {
        sourceMode: 'selected',
        orderIds: [ids[2]!],
      }))!;
      expect(single.draftItems[0]!.inventoryAppliedQuantity).toBe(1);
      expect(legacy.draftItems[0]).toMatchObject({
        inventoryAllocationReview: true,
        inventoryAppliedQuantity: 1,
      });
      let sibling = await saveAdminShoppingListDraft(db, {
        ...(await build([ids[0]!])),
        revision: null,
      });
      scopes.push(sibling.scopeKey);
      const blockedId = randomUUID();
      requests.push(blockedId);
      const blocked = await applyShoppingListInventory(db, {
        sourceMode: sibling.sourceMode,
        orderIds: sibling.orderIds,
        revision: sibling.revision,
        draftIds: sibling.draftItems.map((item) => item.draftId),
        requestId: blockedId,
      });
      expect(blocked.items).toEqual([]);
      expect(blocked.skipped).toHaveLength(1);
      sibling = blocked.draft;
      const review = await loadShoppingListAllocationReview(db, {
        sourceMode: 'selected',
        orderIds: [ids[0]!],
      });
      expect(review.reviews[0]!.products[0]!.recordedQuantity).toBe(1);
      const reviewInput = {
        scopeKey: legacy.scopeKey,
        revision: legacy.revision,
        productId: product!.id,
        requestId: randomUUID(),
        orders: [{ orderId: ids[0]!, quantity: 1 }],
        manualQuantity: 0,
      };
      requests.push(reviewInput.requestId);
      await expect(
        reconcileShoppingListAllocationReview(db, { ...reviewInput, manualQuantity: 1 }),
      ).rejects.toBeInstanceOf(ShoppingListAllocationReviewError);
      await reconcileShoppingListAllocationReview(db, reviewInput);
      expect(await reconcileShoppingListAllocationReview(db, reviewInput)).toEqual({ ok: true });
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!
          .inventoryQuantity,
      ).toBe(50);
      expect(
        (
          await loadShoppingListAllocationReview(db, {
            sourceMode: 'selected',
            orderIds: [ids[0]!],
          })
        ).reviews,
      ).toEqual([]);
      expect(
        (
          await db
            .select()
            .from(orderInventoryAllocations)
            .where(inArray(orderInventoryAllocations.orderId, ids))
        ).map((row) => row.needsReview),
      ).toEqual([false, false, false]);
      sibling = (await loadAdminShoppingListDraft(db, sibling))!;
      sibling = await saveAdminShoppingListDraft(db, {
        ...sibling,
        draftItems: sibling.draftItems.map((item) => ({ ...item, inventoryDecreaseQuantity: 1 })),
      });
      const requestId = randomUUID();
      requests.push(requestId);
      const remaining = await applyShoppingListInventory(db, {
        sourceMode: sibling.sourceMode,
        orderIds: sibling.orderIds,
        revision: sibling.revision,
        draftIds: sibling.draftItems.map((item) => item.draftId),
        requestId,
      });
      expect(remaining.items[0]).toMatchObject({ previousQuantity: 50, nextQuantity: 49 });
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

  it('finds normalized phones, legacy secondary phones, order IDs and exact shipment scans', async () => {
    const db = getDb();
    const [primary, secondary] = await db
      .insert(orders)
      .values([
        { phoneNumber1: '661920629', normalizedPhone: '213661920629', firstName: runId },
        { phoneNumber1: '000000001', phoneNumber2: '0661 92 06 29', firstName: runId },
      ])
      .returning();
    const tracking = `AUDIT${primary!.id}`;
    try {
      await db.insert(ecotrackOrderStates).values({
        orderId: primary!.id,
        reference: tracking,
        trackingNumber: tracking,
        currentStatus: 'prete_a_expedier',
      });
      for (const search of ['0661920629', '661920629', '+213 661 92 06 29']) {
        const result = await loadOrdersPageData({ search }, false);
        expect(result.items.map((row) => row.id)).toEqual(
          expect.arrayContaining([primary!.id, secondary!.id]),
        );
      }
      expect(
        (await loadOrdersPageData({ search: String(primary!.id) }, false)).items.map(
          (row) => row.id,
        ),
      ).toEqual([primary!.id]);
      const scanned = await loadActiveShipmentPageRows(
        db,
        parseEcotrackShipmentListQuery({ search: tracking.toLowerCase() }),
      );
      expect(scanned.rows.map((row) => row.order.id)).toEqual([primary!.id]);
    } finally {
      await db.delete(orders).where(inArray(orders.id, [primary!.id, secondary!.id]));
    }
  });

  it('protects assignments made after taxonomy creation when undoing creation', async () => {
    const { createBrandThroughCanonicalWorkflow } = await import('../lib/taxonomy-mutations');
    const db = getDb();
    const actor = { email: `taxonomy-create-${runId}@example.com` };
    const brand = await createBrandThroughCanonicalWorkflow(
      db,
      { name: `Creation ${runId}` },
      actor,
    );
    const [product] = await db
      .insert(products)
      .values({ title: runId, slug: `taxonomy-create-${runId}`, price: '10', brandId: brand.id! })
      .returning();
    try {
      const [entry] = await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'brands'), eq(actionLogs.entityId, brand.id!)));
      await expect(
        applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' }),
      ).rejects.toThrow('newer work');
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!.brandId,
      ).toBe(brand.id);
      await db.update(products).set({ brandId: null }).where(eq(products.id, product!.id));
      await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'undo' });
      expect(await db.select().from(brands).where(eq(brands.id, brand.id!))).toEqual([]);
      await applyHistoryAction(db, { actionLogId: entry!.id, direction: 'redo' });
      expect(await db.select().from(brands).where(eq(brands.id, brand.id!))).toHaveLength(1);
    } finally {
      await db.delete(products).where(eq(products.id, product!.id));
      await db.delete(brands).where(eq(brands.id, brand.id!));
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    }
  });

  it('restores taxonomy relationships on Undo and rejects recovery over later assignments', async () => {
    const { deleteBrandThroughCanonicalWorkflow, deleteCategoryThroughCanonicalWorkflow } =
      await import('../lib/taxonomy-mutations');
    const db = getDb();
    const actor = { email: `taxonomy-${runId}@example.com` };
    const [brand] = await db
      .insert(brands)
      .values({ name: runId, slug: `taxonomy-${runId}` })
      .returning();
    const [other] = await db
      .insert(brands)
      .values({ name: runId, slug: `other-${runId}` })
      .returning();
    const [parent] = await db
      .insert(categories)
      .values({ name: runId, slug: `parent-${runId}` })
      .returning();
    const [child] = await db
      .insert(categories)
      .values({ name: runId, slug: `child-${runId}`, parentId: parent!.id })
      .returning();
    const [product] = await db
      .insert(products)
      .values({
        title: runId,
        slug: `taxonomy-${runId}`,
        price: '10',
        brandId: brand!.id,
        categoryId: parent!.id,
      })
      .returning();
    const readProduct = async () =>
      (await db.select().from(products).where(eq(products.id, product!.id)))[0]!;
    try {
      await deleteBrandThroughCanonicalWorkflow(db, brand!.id, actor);
      const [brandAction] = await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'brands'), eq(actionLogs.createdBy, actor.email)));
      expect((await readProduct()).brandId).toBeNull();
      await applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'undo' });
      expect((await readProduct()).brandId).toBe(brand!.id);
      await applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'redo' });
      await db.update(products).set({ brandId: other!.id }).where(eq(products.id, product!.id));
      await expect(
        applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'undo' }),
      ).rejects.toThrow('reassigned');
      expect((await readProduct()).brandId).toBe(other!.id);
      expect(await db.select().from(brands).where(eq(brands.id, brand!.id))).toEqual([]);
      await db.update(products).set({ brandId: null }).where(eq(products.id, product!.id));
      await applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'undo' });
      await db.update(products).set({ brandId: other!.id }).where(eq(products.id, product!.id));
      await expect(
        applyHistoryAction(db, { actionLogId: brandAction!.id, direction: 'redo' }),
      ).rejects.toThrow('assignments changed');
      await deleteCategoryThroughCanonicalWorkflow(db, parent!.id, actor);
      const [categoryAction] = await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'categories'), eq(actionLogs.createdBy, actor.email)));
      expect((await readProduct()).categoryId).toBeNull();
      expect(
        (await db.select().from(categories).where(eq(categories.id, child!.id)))[0]!.parentId,
      ).toBeNull();
      await applyHistoryAction(db, { actionLogId: categoryAction!.id, direction: 'undo' });
      expect((await readProduct()).categoryId).toBe(parent!.id);
      expect(
        (await db.select().from(categories).where(eq(categories.id, child!.id)))[0]!.parentId,
      ).toBe(parent!.id);
      await applyHistoryAction(db, { actionLogId: categoryAction!.id, direction: 'redo' });
      expect((await readProduct()).categoryId).toBeNull();
      expect(
        (await db.select().from(categories).where(eq(categories.id, child!.id)))[0]!.parentId,
      ).toBeNull();
    } finally {
      await db.delete(products).where(eq(products.id, product!.id));
      await db.delete(categories).where(inArray(categories.id, [child!.id, parent!.id]));
      await db.delete(brands).where(inArray(brands.id, [brand!.id, other!.id]));
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    }
  });
});
