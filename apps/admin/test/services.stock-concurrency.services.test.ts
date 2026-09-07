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

import { buildGeneratedShoppingListDraft } from '../lib/shopping-list-drafts';
import {
  resetAdminShoppingListDraft,
  saveAdminShoppingListDraft,
  ShoppingListDraftConflictError,
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

  it('atomically bounds shopping deductions across concurrent requests, retries, reopen and quantity increases', async () => {
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({ title: runId, slug: `inventory-${runId}`, price: '10', inventoryQuantity: 10 })
      .returning();
    const [order] = await db
      .insert(orders)
      .values({ firstName: runId, phoneNumber1: '0661920628' })
      .returning();
    await db.insert(orderLineItems).values({
      orderId: order!.id,
      productId: product!.id,
      contentId: String(product!.id),
      rawValue: String(product!.id),
      titleSnapshot: runId,
      originalUnitPrice: '10',
      effectiveUnitPrice: '10',
      quantity: 2,
      lineTotal: '20',
    });
    let scopeKey = '';
    const requestPrefix = `inventory-${runId}`;
    try {
      const generated = await buildGeneratedShoppingListDraft({
        sourceMode: 'selected',
        title: 'Audit inventory',
        orders: [
          {
            id: order!.id,
            fullName: 'Audit',
            note: null,
            orderProducts: [
              {
                productId: product!.id,
                rawValue: String(product!.id),
                title: runId,
                unitPrice: 10,
                quantity: 2,
                lineTotal: 20,
                thumbnailUrl: null,
                missing: false,
              },
            ],
          },
        ],
        resolveProductDetails: async () => ({ inventoryQuantity: 10, purchasePrice: null }),
        resolveBrandName: async () => 'Unbranded',
      });
      const draft = await saveAdminShoppingListDraft(db, {
        ...generated,
        revision: null,
        draftItems: generated.draftItems.map((item) => ({
          ...item,
          inventoryManualAppliedQuantity: 999,
          inventoryLegacyAppliedQuantity: 999,
          inventoryOrderAppliedQuantity: 999,
          inventoryAppliedQuantity: 999,
        })),
      });
      expect(draft.draftItems[0]!.inventoryAppliedQuantity).toBe(0);
      scopeKey = draft.scopeKey;
      const input = {
        sourceMode: draft.sourceMode,
        orderIds: draft.orderIds,
        revision: draft.revision,
        draftIds: draft.draftItems.map((item) => item.draftId),
        requestId: `${requestPrefix}-one`,
      };
      const concurrent = await Promise.allSettled([
        applyShoppingListInventory(db, input),
        applyShoppingListInventory(db, { ...input, requestId: `${requestPrefix}-two` }),
      ]);
      expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = concurrent.find(
        (result) => result.status === 'rejected',
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(ShoppingListDraftConflictError);
      const first = concurrent.find(
        (result) => result.status === 'fulfilled',
      ) as PromiseFulfilledResult<Awaited<ReturnType<typeof applyShoppingListInventory>>>;
      const successfulId =
        concurrent[0]!.status === 'fulfilled' ? input.requestId : `${requestPrefix}-two`;
      const retry = await applyShoppingListInventory(db, { ...input, requestId: successfulId });
      expect(retry).toEqual(first.value);
      const repeat = await applyShoppingListInventory(db, {
        ...input,
        revision: retry.draft.revision,
        requestId: `${requestPrefix}-repeat`,
      });
      expect(repeat.items).toEqual([]);
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!
          .inventoryQuantity,
      ).toBe(8);
      const increased = await saveAdminShoppingListDraft(db, {
        ...repeat.draft,
        draftItems: repeat.draft.draftItems.map((item) => ({
          ...item,
          quantity: 5,
          inventoryDecreaseQuantity: 3,
        })),
      });
      const extra = await applyShoppingListInventory(db, {
        ...input,
        revision: increased.revision,
        requestId: `${requestPrefix}-extra`,
      });
      expect(extra.items[0]).toMatchObject({ previousQuantity: 8, nextQuantity: 5 });
      expect(extra.draft.draftItems[0]).toMatchObject({
        inventoryAppliedQuantity: 5,
        inventoryDecreaseQuantity: 0,
      });
      const reset = await resetAdminShoppingListDraft(db, {
        ...input,
        revision: extra.draft.revision,
      });
      const resetApply = await applyShoppingListInventory(db, {
        ...input,
        revision: reset.revision,
        requestId: `${requestPrefix}-reset`,
      });
      expect(resetApply.items).toEqual([]);
      const removed = await saveAdminShoppingListDraft(db, { ...resetApply.draft, draftItems: [] });
      expect(removed.generatedItems[0]!.inventoryAppliedQuantity).toBe(5);
      const readded = await saveAdminShoppingListDraft(db, {
        ...removed,
        draftItems: [
          {
            ...generated.draftItems[0]!,
            draftId: `custom:${product!.id}`,
            quantity: 5,
            inventoryAppliedQuantity: 0,
            inventoryDecreaseQuantity: 5,
            isCustom: true,
          },
        ],
      });
      expect(readded.draftItems[0]).toMatchObject({
        inventoryAppliedQuantity: 5,
        inventoryDecreaseQuantity: 0,
      });
      const reapply = await applyShoppingListInventory(db, {
        ...input,
        draftIds: readded.draftItems.map((item) => item.draftId),
        revision: readded.revision,
        requestId: `${requestPrefix}-readd`,
      });
      expect(reapply.items).toEqual([]);
      const duplicated = await saveAdminShoppingListDraft(db, {
        ...reapply.draft,
        draftItems: [
          {
            ...readded.draftItems[0]!,
            draftId: 'duplicate:first',
            quantity: 3,
            inventoryAppliedQuantity: 5,
            inventoryDecreaseQuantity: 3,
          },
          {
            ...readded.draftItems[0]!,
            draftId: 'duplicate:second',
            quantity: 2,
            inventoryAppliedQuantity: 5,
            inventoryDecreaseQuantity: 2,
          },
        ],
      });
      expect(duplicated.draftItems.map((item) => item.inventoryAppliedQuantity)).toEqual([3, 2]);
      const reordered = await saveAdminShoppingListDraft(db, {
        ...duplicated,
        draftItems: [...duplicated.draftItems].reverse(),
      });
      expect(reordered.draftItems.map((item) => item.inventoryAppliedQuantity)).toEqual([2, 3]);
      const ledgerOnly = await saveAdminShoppingListDraft(db, {
        ...reordered,
        generatedItems: [],
        draftItems: [],
      });
      expect(ledgerOnly.generatedItems[0]).toMatchObject({
        inventoryAppliedQuantity: 5,
        inventoryLedgerOnly: true,
      });
      const resetLedger = await resetAdminShoppingListDraft(db, {
        ...input,
        revision: ledgerOnly.revision,
      });
      expect(resetLedger.draftItems).toEqual([]);
      expect(resetLedger.generatedItems[0]!.inventoryAppliedQuantity).toBe(5);
      expect(
        (await db.select().from(products).where(eq(products.id, product!.id)))[0]!
          .inventoryQuantity,
      ).toBe(5);
    } finally {
      if (scopeKey)
        await db.delete(shoppingListDrafts).where(eq(shoppingListDrafts.scopeKey, scopeKey));
      await db.delete(adminMutationIdempotency).where(
        inArray(
          adminMutationIdempotency.requestId,
          ['one', 'two', 'repeat', 'extra', 'reset', 'readd'].map(
            (suffix) => `${requestPrefix}-${suffix}`,
          ),
        ),
      );
      await db
        .delete(actionLogs)
        .where(and(eq(actionLogs.entityType, 'products'), eq(actionLogs.entityId, product!.id)));
      await db.delete(orders).where(eq(orders.id, order!.id));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });
});
