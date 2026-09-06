import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';
import { z } from 'zod';

import { orderInventoryAllocations, orders, products, shoppingListDrafts } from '@bric/db/schema';
import type { Transaction } from './action-history';
import { refreshShoppingListStockCreditsInTransaction } from './shopping-list-stock-allocations';

const quantity = z.number().int().nonnegative();
const allocationSnapshotSchema = z.object({
  orders: z.array(
    z.object({
      orderId: z.number().int().positive(),
      productId: z.number().int().positive(),
      quantity,
    }),
  ),
  manual: z
    .object({ scopeKey: z.string().min(1), productId: z.number().int().positive(), quantity })
    .nullable(),
});

export type StockAllocationSnapshot = z.infer<typeof allocationSnapshotSchema>;
export type StockAllocationChange = {
  before: StockAllocationSnapshot;
  after: StockAllocationSnapshot;
};

export class StockAllocationHistoryConflictError extends Error {}

export function parseStockAllocationChange(
  before: unknown,
  after: unknown,
  productId: number,
): StockAllocationChange | null {
  if (before === undefined && after === undefined) return null;
  const a = allocationSnapshotSchema.safeParse(before);
  const b = allocationSnapshotSchema.safeParse(after);
  if (!a.success || !b.success)
    throw new StockAllocationHistoryConflictError('Stock allocation history is incomplete.');
  const keys = (value: StockAllocationSnapshot) =>
    value.orders.map((row) => row.orderId).sort((x, y) => x - y);
  const aKeys = keys(a.data);
  if (
    new Set(aKeys).size !== aKeys.length ||
    JSON.stringify(aKeys) !== JSON.stringify(keys(b.data)) ||
    a.data.orders.some((row) => row.productId !== productId) ||
    b.data.orders.some((row) => row.productId !== productId) ||
    (a.data.manual?.productId != null && a.data.manual.productId !== productId) ||
    (b.data.manual?.productId != null && b.data.manual.productId !== productId) ||
    a.data.manual?.scopeKey !== b.data.manual?.scopeKey
  ) {
    throw new StockAllocationHistoryConflictError(
      'Stock allocation history has inconsistent ownership.',
    );
  }
  return { before: a.data, after: b.data };
}

export async function lockStockAllocationHistory(
  tx: Transaction,
  productId: number,
  snapshot: StockAllocationSnapshot,
) {
  if (snapshot.manual) {
    const rows = await tx
      .select({ scopeKey: shoppingListDrafts.scopeKey })
      .from(shoppingListDrafts)
      .where(eq(shoppingListDrafts.scopeKey, snapshot.manual.scopeKey))
      .for('update');
    if (!rows.length)
      throw new StockAllocationHistoryConflictError(
        'The shopping list needed for stock recovery no longer exists.',
      );
  }
  const orderIds = snapshot.orders.map((row) => row.orderId).sort((a, b) => a - b);
  if (orderIds.length) {
    const rows = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.id, orderIds))
      .orderBy(asc(orders.id))
      .for('update');
    if (rows.length !== orderIds.length)
      throw new StockAllocationHistoryConflictError(
        'An order needed for stock recovery no longer exists.',
      );
  }
  const rows = await tx
    .select({ id: products.id })
    .from(products)
    .where(eq(products.id, productId))
    .for('update');
  if (!rows.length)
    throw new StockAllocationHistoryConflictError(
      'The product needed for stock recovery no longer exists.',
    );
}

export async function restoreStockAllocationHistory(
  tx: Transaction,
  expected: StockAllocationSnapshot,
  target: StockAllocationSnapshot,
) {
  for (const row of expected.orders) {
    const replacement = target.orders.find((item) => item.orderId === row.orderId)!;
    const updated = await tx
      .update(orderInventoryAllocations)
      .set({ quantity: replacement.quantity, updatedAt: new Date() })
      .where(
        and(
          eq(orderInventoryAllocations.orderId, row.orderId),
          eq(orderInventoryAllocations.productId, row.productId),
          eq(orderInventoryAllocations.quantity, row.quantity),
        ),
      )
      .returning({ orderId: orderInventoryAllocations.orderId });
    if (!updated.length)
      throw new StockAllocationHistoryConflictError(
        'Order stock allocations have changed since this action.',
      );
  }
  if (expected.manual && target.manual) {
    const [draft] = await tx
      .select()
      .from(shoppingListDrafts)
      .where(eq(shoppingListDrafts.scopeKey, expected.manual.scopeKey));
    if (!draft || !Array.isArray(draft.generatedItems))
      throw new StockAllocationHistoryConflictError(
        'The shopping-list stock balance is unavailable.',
      );
    const productId = expected.manual.productId;
    const items = draft.generatedItems as Array<Record<string, unknown>>;
    const matches = items.filter((item) => item.productId === productId);
    const current = matches.reduce(
      (sum, item) => sum + Number(item.inventoryManualAppliedQuantity ?? 0),
      0,
    );
    if (!matches.length || current !== expected.manual.quantity)
      throw new StockAllocationHistoryConflictError(
        'The shopping-list stock balance has changed since this action.',
      );
    const [product] = await tx
      .select({ inventoryQuantity: products.inventoryQuantity })
      .from(products)
      .where(eq(products.id, productId));
    if (!product) {
      throw new StockAllocationHistoryConflictError(
        'The product needed for stock recovery no longer exists.',
      );
    }
    let restored = false;
    const generatedItems = items.map((item) => {
      if (item.productId !== productId) return item;
      const value = restored ? 0 : target.manual!.quantity;
      restored = true;
      return {
        ...item,
        inventoryManualAppliedQuantity: value,
        inventoryQuantity: product.inventoryQuantity,
      };
    });
    const draftItems = (draft.draftItems as Array<Record<string, unknown>>).map((item) =>
      item.productId === productId
        ? { ...item, inventoryQuantity: product.inventoryQuantity }
        : item,
    );
    await tx
      .update(shoppingListDrafts)
      .set({ generatedItems, draftItems })
      .where(eq(shoppingListDrafts.scopeKey, expected.manual.scopeKey));
    await refreshShoppingListStockCreditsInTransaction(tx, expected.manual.scopeKey);
  }
}

export async function assertProductAllocationsCanBeDeleted(tx: Transaction, productId: number) {
  const [allocation] = await tx
    .select({ orderId: orderInventoryAllocations.orderId })
    .from(orderInventoryAllocations)
    .where(
      and(
        eq(orderInventoryAllocations.productId, productId),
        or(
          gt(orderInventoryAllocations.quantity, 0),
          eq(orderInventoryAllocations.needsReview, true),
        ),
      ),
    )
    .limit(1);
  if (allocation) {
    throw new StockAllocationHistoryConflictError(
      'Product stock allocations must be recovered before deleting this product.',
    );
  }
}
