import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { getDb } from '@bric/db/client';
import { orderInventoryAllocations, products, shoppingListDrafts } from '@bric/db/schema';
import type { ActionActor } from './action-history';
import { runIdempotentAdminMutation } from './admin-mutation-idempotency';
import { applyInventoryQuantityChangeInTransaction } from './inventory-actions';
import { buildShoppingListScopeKey, shoppingListDraftQuerySchema } from './shopping-list-drafts';
import {
  serializeShoppingListDraft,
  ShoppingListDraftConflictError,
} from './shopping-list-drafts.server';
import {
  hydrateShoppingListStockCredits,
  initializeLegacyShoppingListAllocations,
  lockShoppingListAllocationOrders,
  shoppingListOrderRequirements,
  setOrderAllocationQuantity,
} from './shopping-list-stock-allocations';
import type { StockAllocationSnapshot } from './stock-allocation-history';
import { CACHE_TAGS, revalidateServerTags } from './server-cache';
import { revalidateStorefrontProducts } from './storefront-revalidate';

export const shoppingListInventoryApplySchema = shoppingListDraftQuerySchema
  .extend({
    revision: z.number().int().nonnegative(),
    requestId: z.string().trim().min(1).max(200),
    draftIds: z.array(z.string().min(1).max(220)).min(1).max(500),
  })
  .strict();

export async function applyShoppingListInventory(
  db: ReturnType<typeof getDb>,
  input: z.input<typeof shoppingListInventoryApplySchema>,
  actor?: ActionActor,
) {
  const values = shoppingListInventoryApplySchema.parse(input);
  const result = await runIdempotentAdminMutation(db, {
    scope: 'shopping-list-inventory',
    requestId: values.requestId,
    payload: values,
    execute: async (tx) => {
      await initializeLegacyShoppingListAllocations(tx);
      const scopeKey = buildShoppingListScopeKey(values.sourceMode, values.orderIds);
      const [row] = await tx
        .select()
        .from(shoppingListDrafts)
        .where(eq(shoppingListDrafts.scopeKey, scopeKey))
        .for('update');
      if (!row || row.revision !== values.revision) throw new ShoppingListDraftConflictError();
      const persisted = serializeShoppingListDraft(row);
      const orderIds = await lockShoppingListAllocationOrders(tx, persisted);
      const draft = await hydrateShoppingListStockCredits(tx, persisted);
      const requirements = await shoppingListOrderRequirements(tx, orderIds);
      const selected = new Set(values.draftIds);
      const items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }> =
        [];
      const skipped: Array<{ productId: number; reason: string }> = [];
      const productIds = [
        ...new Set(
          draft.draftItems
            .filter((item) => selected.has(item.draftId) && item.productId != null)
            .map((item) => item.productId!),
        ),
      ].sort((a, b) => a - b);
      if (productIds.length)
        await tx
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, productIds))
          .orderBy(asc(products.id))
          .for('update');
      for (const productId of productIds) {
        const candidates = draft.draftItems.filter(
          (item) => item.productId === productId && selected.has(item.draftId),
        );
        if (candidates.some((item) => item.inventoryAllocationReview)) {
          skipped.push({
            productId,
            reason:
              'Previous stock deductions need attribution review before this product can be deducted again.',
          });
          continue;
        }
        const quantity = candidates.reduce(
          (sum, item) =>
            sum +
            Math.min(
              item.inventoryDecreaseQuantity,
              Math.max(item.quantity - item.inventoryAppliedQuantity, 0),
            ),
          0,
        );
        if (quantity <= 0) continue;
        const lines = requirements
          .filter((line) => line.productId === productId)
          .sort((a, b) => a.orderId - b.orderId);
        const allocations = orderIds.length
          ? await tx
              .select()
              .from(orderInventoryAllocations)
              .where(
                and(
                  eq(orderInventoryAllocations.productId, productId),
                  inArray(orderInventoryAllocations.orderId, orderIds),
                ),
              )
          : [];
        const ledger = draft.generatedItems.find((item) => item.productId === productId)!;
        const manual = ledger.inventoryManualAppliedQuantity ?? 0;
        const before: StockAllocationSnapshot = {
          orders: [],
          manual: { scopeKey, productId, quantity: manual },
        };
        const after: StockAllocationSnapshot = {
          orders: [],
          manual: { scopeKey, productId, quantity: manual },
        };
        let remaining = quantity;
        for (const line of lines) {
          const applied =
            allocations.find((allocation) => allocation.orderId === line.orderId)?.quantity ?? 0;
          const extra = Math.min(remaining, Math.max(line.quantity - applied, 0));
          if (extra <= 0) continue;
          await setOrderAllocationQuantity(tx, line.orderId, productId, applied);
          before.orders.push({ orderId: line.orderId, productId, quantity: applied });
          after.orders.push({ orderId: line.orderId, productId, quantity: applied + extra });
          remaining -= extra;
        }
        after.manual!.quantity += remaining;
        const change = await applyInventoryQuantityChangeInTransaction(tx, {
          productId,
          mode: 'decrease',
          quantity,
          actor,
          stockAllocations: { before, after },
        });
        if (change.kind !== 'updated') {
          skipped.push({
            productId,
            reason:
              change.kind === 'insufficient'
                ? 'Insufficient inventory quantity.'
                : 'Product not found.',
          });
          continue;
        }
        for (const allocation of after.orders)
          await setOrderAllocationQuantity(tx, allocation.orderId, productId, allocation.quantity);
        ledger.inventoryManualAppliedQuantity = after.manual!.quantity;
        for (const item of draft.draftItems)
          if (item.productId === productId) {
            item.inventoryQuantity = change.nextQuantity;
            if (selected.has(item.draftId)) item.checked = true;
          }
        ledger.inventoryQuantity = change.nextQuantity;
        items.push({
          productId,
          previousQuantity: change.previousQuantity,
          nextQuantity: change.nextQuantity,
        });
      }
      const reconciled = await hydrateShoppingListStockCredits(tx, draft);
      const [saved] = await tx
        .update(shoppingListDrafts)
        .set({
          draftItems: reconciled.draftItems,
          generatedItems: reconciled.generatedItems,
          revision: row.revision + 1,
          updatedAt: new Date(),
          updatedBy: actor?.email ?? 'unknown@example.com',
          updatedByName: actor?.name?.trim() || actor?.email || 'unknown@example.com',
        })
        .where(eq(shoppingListDrafts.scopeKey, scopeKey))
        .returning();
      return {
        ok: true as const,
        complete: skipped.length === 0,
        items,
        skipped,
        draft: serializeShoppingListDraft(saved!),
      };
    },
  });
  if (!result.replayed && result.value.items.length) {
    revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
    await revalidateStorefrontProducts();
  }
  return result.value;
}
