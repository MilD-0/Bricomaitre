import { orderInventoryAllocations, orders, products, shoppingListDrafts } from '@bric/db/schema';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import {
  reconcileShoppingListAllocations,
  type ShoppingListDraftPayload,
} from '../shopping-list-drafts';
import {
  shoppingListAllocationOrderIds,
  shoppingListOrderRequirements,
  stockDraftPayload,
  type StockTransaction,
} from './contract';

/** Run before taking any individual draft/order/product locks. Old snapshots have no
 * product IDs on order groups, so only uniquely supported attribution is imported. */
export async function initializeLegacyShoppingListAllocations(tx: StockTransaction) {
  const [pending] = await tx
    .select({ id: shoppingListDrafts.id })
    .from(shoppingListDrafts)
    .where(eq(shoppingListDrafts.allocationVersion, 0))
    .limit(1);
  if (!pending) return;
  await tx.execute(sql`select pg_advisory_xact_lock(81943027)`);
  const drafts = await tx
    .select()
    .from(shoppingListDrafts)
    .where(eq(shoppingListDrafts.allocationVersion, 0))
    .orderBy(asc(shoppingListDrafts.id))
    .for('update');
  const allIds = [
    ...new Set(drafts.flatMap((row) => shoppingListAllocationOrderIds(stockDraftPayload(row)))),
  ].sort((a, b) => a - b);
  const existingOrders = allIds.length
    ? await tx
        .select({ id: orders.id })
        .from(orders)
        .where(inArray(orders.id, allIds))
        .orderBy(asc(orders.id))
        .for('update')
    : [];
  const existingIds = new Set(existingOrders.map((row) => row.id));
  const productIds = [
    ...new Set(
      drafts.flatMap((row) =>
        [...stockDraftPayload(row).generatedItems, ...stockDraftPayload(row).draftItems].flatMap(
          (item) => (item.productId == null ? [] : [item.productId]),
        ),
      ),
    ),
  ].sort((a, b) => a - b);
  const existingProducts = productIds.length
    ? await tx
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, productIds))
        .orderBy(asc(products.id))
        .for('update')
    : [];
  const existingProductIds = new Set(existingProducts.map((row) => row.id));
  for (const row of drafts) {
    const draft = reconcileShoppingListAllocations(stockDraftPayload(row));
    const ids = shoppingListAllocationOrderIds(draft).filter((id) => existingIds.has(id));
    const requirements = await shoppingListOrderRequirements(tx, ids);
    const generatedItems = draft.generatedItems.map((item) => ({
      ...item,
      inventoryManualAppliedQuantity: 0,
      inventoryOrderAppliedQuantity: 0,
      inventoryLegacyAppliedQuantity: 0,
    }));
    for (const item of generatedItems) {
      const applied = item.inventoryAppliedQuantity;
      if (item.productId == null || applied <= 0 || !existingProductIds.has(item.productId))
        continue;
      const matches = requirements.filter((line) => line.productId === item.productId);
      const total = matches.reduce((sum, line) => sum + line.quantity, 0);
      const sameIdentity = draft.generatedItems
        .filter((other) => other.title === item.title && other.brandId === item.brandId)
        .every((other) => other.productId === item.productId);
      const snapshotMatches =
        sameIdentity &&
        matches.every((line) => {
          const snapshot = draft.orders.find((order) => order.orderId === line.orderId);
          return (
            snapshot?.products
              .filter((product) => product.title === item.title && product.brandId === item.brandId)
              .reduce((sum, product) => sum + product.quantity, 0) === line.quantity
          );
        });
      const mentionedBySnapshot = draft.orders.some((order) =>
        order.products.some(
          (product) => product.title === item.title && product.brandId === item.brandId,
        ),
      );
      const safe =
        matches.length > 0 && snapshotMatches && (matches.length === 1 || applied >= total);
      const manualOnly = item.isCustom && matches.length === 0 && !mentionedBySnapshot;
      if (manualOnly) {
        item.inventoryManualAppliedQuantity = applied;
        continue;
      }
      if (safe) {
        for (const line of matches) {
          const quantity = Math.min(applied, line.quantity);
          await tx
            .insert(orderInventoryAllocations)
            .values({
              orderId: line.orderId,
              productId: item.productId,
              quantity,
              legacyScopeKeys: [row.scopeKey],
            })
            .onConflictDoUpdate({
              target: [orderInventoryAllocations.orderId, orderInventoryAllocations.productId],
              set: {
                quantity: sql`greatest(${orderInventoryAllocations.quantity},${quantity})`,
                legacyScopeKeys: sql`array(select distinct unnest(${orderInventoryAllocations.legacyScopeKeys} || ARRAY[${row.scopeKey}]::text[]))`,
              },
            });
        }
        item.inventoryManualAppliedQuantity = Math.max(applied - total, 0);
      } else {
        // Preserve evidence without assigning a partial batch to arbitrary orders.
        item.inventoryLegacyAppliedQuantity = applied;
        for (const orderId of ids)
          await tx
            .insert(orderInventoryAllocations)
            .values({
              orderId,
              productId: item.productId,
              needsReview: true,
              legacyScopeKeys: [row.scopeKey],
            })
            .onConflictDoUpdate({
              target: [orderInventoryAllocations.orderId, orderInventoryAllocations.productId],
              set: {
                needsReview: true,
                legacyScopeKeys: sql`array(select distinct unnest(${orderInventoryAllocations.legacyScopeKeys} || ARRAY[${row.scopeKey}]::text[]))`,
              },
            });
      }
    }
    await tx
      .update(shoppingListDrafts)
      .set({ allocationVersion: 1, generatedItems })
      .where(eq(shoppingListDrafts.id, row.id));
  }
}

export async function lockShoppingListAllocationOrders(
  tx: StockTransaction,
  draft: ShoppingListDraftPayload,
) {
  const ids = shoppingListAllocationOrderIds(draft);
  if (ids.length)
    await tx
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.id, ids))
      .orderBy(asc(orders.id))
      .for('update');
  return ids;
}

export async function setOrderAllocationQuantity(
  tx: StockTransaction,
  orderId: number,
  productId: number,
  quantity: number,
) {
  await tx
    .insert(orderInventoryAllocations)
    .values({ orderId, productId, quantity })
    .onConflictDoUpdate({
      target: [orderInventoryAllocations.orderId, orderInventoryAllocations.productId],
      set: { quantity, updatedAt: new Date() },
    });
}
