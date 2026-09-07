import { orderInventoryAllocations, products, shoppingListDrafts } from '@bric/db/schema';
import { eq, inArray } from 'drizzle-orm';
import {
  reconcileShoppingListAllocations,
  type ShoppingListDraftItem,
  type ShoppingListDraftPayload,
} from '../shopping-list-drafts';
import {
  shoppingListAllocationOrderIds,
  stockDraftPayload,
  type Reader,
  type StockTransaction,
} from './contract';

export async function hydrateShoppingListStockCredits<T extends ShoppingListDraftPayload>(
  db: Reader,
  draft: T,
): Promise<T> {
  const orderIds = shoppingListAllocationOrderIds(draft);
  const allocations = orderIds.length
    ? await db
        .select()
        .from(orderInventoryAllocations)
        .where(inArray(orderInventoryAllocations.orderId, orderIds))
    : [];
  const credits = new Map<number, number>();
  const review = new Set<number>();
  for (const allocation of allocations) {
    credits.set(
      allocation.productId,
      (credits.get(allocation.productId) ?? 0) + allocation.quantity,
    );
    if (allocation.needsReview) review.add(allocation.productId);
  }
  // Include removed manual items as invisible ledger entries, never recreated visible lines.
  const templates = new Map<number, ShoppingListDraftItem>();
  for (const item of [...draft.draftItems, ...draft.generatedItems])
    if (item.productId != null) templates.set(item.productId, item);
  const stockRows = templates.size
    ? await db
        .select({ id: products.id, inventoryQuantity: products.inventoryQuantity })
        .from(products)
        .where(inArray(products.id, [...templates.keys()]))
    : [];
  const stock = new Map(stockRows.map((row) => [row.id, row.inventoryQuantity]));
  const generatedItems = [
    ...draft.generatedItems.filter((item) => item.productId == null),
    ...[...templates.values()].map((item) => {
      const orderCredit = credits.get(item.productId!) ?? 0;
      const manualCredit = item.inventoryManualAppliedQuantity ?? 0;
      const legacyCredit = item.inventoryLegacyAppliedQuantity ?? 0;
      if (legacyCredit > 0) review.add(item.productId!);
      return {
        ...item,
        inventoryLedgerOnly: !draft.generatedItems.some(
          (g) => g.productId === item.productId && !g.inventoryLedgerOnly,
        ),
        inventoryQuantity: stock.get(item.productId!) ?? null,
        inventoryOrderAppliedQuantity: orderCredit,
        inventoryManualAppliedQuantity: manualCredit,
        inventoryAppliedQuantity: orderCredit + manualCredit + legacyCredit,
        inventoryAllocationReview: review.has(item.productId!),
      };
    }),
  ];
  const reconciled = reconcileShoppingListAllocations(
    {
      ...draft,
      generatedItems,
      draftItems: draft.draftItems.map((item) => ({
        ...item,
        inventoryQuantity: item.productId == null ? null : (stock.get(item.productId) ?? null),
      })),
    },
    { generatedItems, draftItems: [] },
  );
  return {
    ...reconciled,
    draftItems: reconciled.draftItems.map((item) => ({
      ...item,
      inventoryAllocationReview: item.productId != null && review.has(item.productId),
    })),
  };
}

export async function refreshShoppingListStockCreditsInTransaction(
  tx: StockTransaction,
  scopeKey: string,
) {
  const [row] = await tx
    .select()
    .from(shoppingListDrafts)
    .where(eq(shoppingListDrafts.scopeKey, scopeKey))
    .for('update');
  if (!row) return;
  const draft = await hydrateShoppingListStockCredits(tx, stockDraftPayload(row));
  await tx
    .update(shoppingListDrafts)
    .set({
      generatedItems: draft.generatedItems,
      draftItems: draft.draftItems,
      revision: row.revision + 1,
      updatedAt: new Date(),
    })
    .where(eq(shoppingListDrafts.id, row.id));
}
