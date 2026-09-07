import {
  actionLogs,
  orderInventoryAllocations,
  products,
  shoppingListDrafts,
} from '@bric/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionActor } from '../action-history';
import { runIdempotentAdminMutation } from '../admin-mutation-idempotency';
import { buildShoppingListScopeKey, type ShoppingListDraftPayload } from '../shopping-list-drafts';
import { ShoppingListDraftConflictError } from '../shopping-list-drafts.server';
import {
  shoppingListAllocationOrderIds,
  ShoppingListAllocationReviewError,
  shoppingListAllocationReviewSchema,
  shoppingListOrderRequirements,
  stockDraftPayload,
  type Database,
  type ShoppingListAllocationReview,
} from './contract';
import { refreshShoppingListStockCreditsInTransaction } from './credits';
import {
  initializeLegacyShoppingListAllocations,
  lockShoppingListAllocationOrders,
} from './legacy';

export async function loadShoppingListAllocationReview(
  db: Database,
  input: Pick<ShoppingListDraftPayload, 'sourceMode' | 'orderIds'>,
): Promise<ShoppingListAllocationReview> {
  return db.transaction(async (tx) => {
    await initializeLegacyShoppingListAllocations(tx);
    const [requested] = await tx
      .select()
      .from(shoppingListDrafts)
      .where(
        eq(
          shoppingListDrafts.scopeKey,
          buildShoppingListScopeKey(input.sourceMode, input.orderIds),
        ),
      );
    const ids = requested
      ? shoppingListAllocationOrderIds(stockDraftPayload(requested))
      : input.orderIds;
    const held = ids.length
      ? await tx
          .select()
          .from(orderInventoryAllocations)
          .where(
            and(
              inArray(orderInventoryAllocations.orderId, ids),
              eq(orderInventoryAllocations.needsReview, true),
            ),
          )
      : [];
    const keys = [...new Set(held.flatMap((row) => row.legacyScopeKeys))];
    if (requested) keys.push(requested.scopeKey);
    const rows = keys.length
      ? await tx.select().from(shoppingListDrafts).where(inArray(shoppingListDrafts.scopeKey, keys))
      : [];
    const reviews: ShoppingListAllocationReview['reviews'] = [];
    for (const row of rows) {
      const draft = stockDraftPayload(row);
      const unresolved = draft.generatedItems.filter(
        (item) => item.productId != null && (item.inventoryLegacyAppliedQuantity ?? 0) > 0,
      );
      if (!unresolved.length) continue;
      const orderIds = shoppingListAllocationOrderIds(draft);
      const requirements = await shoppingListOrderRequirements(tx, orderIds);
      const existing = orderIds.length
        ? await tx
            .select()
            .from(orderInventoryAllocations)
            .where(inArray(orderInventoryAllocations.orderId, orderIds))
        : [];
      reviews.push({
        scopeKey: row.scopeKey,
        revision: row.revision,
        title: row.title,
        products: unresolved.map((item) => ({
          productId: item.productId!,
          title: item.title,
          recordedQuantity: item.inventoryLegacyAppliedQuantity!,
          manualAppliedQuantity: item.inventoryManualAppliedQuantity ?? 0,
          orders: orderIds
            .filter((orderId) =>
              existing.some((a) => a.orderId === orderId && a.productId === item.productId),
            )
            .map((orderId) => ({
              orderId,
              requiredQuantity:
                requirements.find(
                  (line) => line.orderId === orderId && line.productId === item.productId,
                )?.quantity ?? 0,
              currentAppliedQuantity:
                existing.find((a) => a.orderId === orderId && a.productId === item.productId)
                  ?.quantity ?? 0,
            })),
        })),
      });
    }
    return { reviews };
  });
}

export async function reconcileShoppingListAllocationReview(
  db: Database,
  input: z.input<typeof shoppingListAllocationReviewSchema>,
  actor?: ActionActor,
) {
  const values = shoppingListAllocationReviewSchema.parse(input);
  const result = await runIdempotentAdminMutation(db, {
    scope: 'shopping-stock-attribution',
    requestId: values.requestId,
    payload: values,
    execute: async (tx) => {
      await initializeLegacyShoppingListAllocations(tx);
      // All review drafts lock before orders/products, including the other sources of a hold.
      const held = await tx
        .select()
        .from(orderInventoryAllocations)
        .where(
          and(
            eq(orderInventoryAllocations.productId, values.productId),
            eq(orderInventoryAllocations.needsReview, true),
          ),
        );
      const scopeKeys = [
        ...new Set([values.scopeKey, ...held.flatMap((row) => row.legacyScopeKeys)]),
      ].sort();
      const draftRows = await tx
        .select()
        .from(shoppingListDrafts)
        .where(inArray(shoppingListDrafts.scopeKey, scopeKeys))
        .orderBy(asc(shoppingListDrafts.scopeKey))
        .for('update');
      const row = draftRows.find((row) => row.scopeKey === values.scopeKey);
      if (!row || row.revision !== values.revision) throw new ShoppingListDraftConflictError();
      const draft = stockDraftPayload(row);
      const ledger = draft.generatedItems.find((item) => item.productId === values.productId);
      const recorded = ledger?.inventoryLegacyAppliedQuantity ?? 0;
      if (recorded <= 0)
        throw new ShoppingListAllocationReviewError(
          'This stock deduction no longer needs attribution.',
        );
      const ids = await lockShoppingListAllocationOrders(tx, draft);
      const unique = new Set(values.orders.map((order) => order.orderId));
      if (
        unique.size !== values.orders.length ||
        values.orders.some((order) => !ids.includes(order.orderId))
      )
        throw new ShoppingListAllocationReviewError(
          'Choose each order from this shopping list at most once.',
        );
      if (
        values.orders.reduce((sum, order) => sum + order.quantity, values.manualQuantity) !==
        recorded
      )
        throw new ShoppingListAllocationReviewError(
          'Order allocations and the manual remainder must equal the recorded deduction.',
        );
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, values.productId))
        .for('update');
      if (!product) throw new ShoppingListAllocationReviewError('This product no longer exists.');
      const current = ids.length
        ? await tx
            .select()
            .from(orderInventoryAllocations)
            .where(
              and(
                eq(orderInventoryAllocations.productId, values.productId),
                inArray(orderInventoryAllocations.orderId, ids),
              ),
            )
        : [];
      if (values.orders.some((order) => !current.some((row) => row.orderId === order.orderId)))
        throw new ShoppingListAllocationReviewError(
          'An order needed for attribution no longer exists.',
        );
      ledger!.inventoryLegacyAppliedQuantity = 0;
      ledger!.inventoryManualAppliedQuantity =
        (ledger!.inventoryManualAppliedQuantity ?? 0) + values.manualQuantity;
      for (const allocation of current) {
        const quantity = Math.max(
          allocation.quantity,
          values.orders.find((order) => order.orderId === allocation.orderId)?.quantity ?? 0,
        );
        const needsReview = allocation.legacyScopeKeys.some(
          (key) =>
            key !== values.scopeKey &&
            draftRows.some(
              (other) =>
                other.scopeKey === key &&
                stockDraftPayload(other).generatedItems.some(
                  (item) =>
                    item.productId === values.productId &&
                    (item.inventoryLegacyAppliedQuantity ?? 0) > 0,
                ),
            ),
        );
        await tx
          .update(orderInventoryAllocations)
          .set({ quantity, needsReview, updatedAt: new Date() })
          .where(
            and(
              eq(orderInventoryAllocations.orderId, allocation.orderId),
              eq(orderInventoryAllocations.productId, values.productId),
            ),
          );
      }
      await tx
        .update(shoppingListDrafts)
        .set({
          generatedItems: draft.generatedItems,
          updatedBy: actor?.email,
          updatedByName: actor?.name || actor?.email,
        })
        .where(eq(shoppingListDrafts.id, row.id));
      await refreshShoppingListStockCreditsInTransaction(tx, row.scopeKey);
      await tx.insert(actionLogs).values({
        resource: 'products',
        entityType: 'products',
        entityId: values.productId,
        entityLabel: product.title,
        operation: 'update',
        beforeState: {
          legacyStockAttribution: { scopeKey: row.scopeKey, recordedQuantity: recorded },
        },
        afterState: {
          legacyStockAttribution: {
            scopeKey: row.scopeKey,
            orders: values.orders,
            manualQuantity: values.manualQuantity,
          },
        },
        createdBy: actor?.email,
        createdByName: actor?.name || actor?.email,
        isReversible: false,
      });
      return { ok: true as const };
    },
  });
  return result.value;
}
