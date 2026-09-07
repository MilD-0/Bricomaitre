import type { getDb } from '@bric/db/client';
import { orderLineItems, shoppingListDrafts } from '@bric/db/schema';
import { inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  MAX_SHOPPING_LIST_ENTRIES,
  shoppingListDraftPayloadSchema,
  type ShoppingListDraftPayload,
} from '../shopping-list-drafts';

export type Database = ReturnType<typeof getDb>;

export type StockTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type Reader = Database | StockTransaction;

export function shoppingListAllocationOrderIds(draft: ShoppingListDraftPayload) {
  return [...new Set([...draft.orderIds, ...draft.orders.map((order) => order.orderId)])].sort(
    (a, b) => a - b,
  );
}

export function stockDraftPayload(row: typeof shoppingListDrafts.$inferSelect) {
  return shoppingListDraftPayloadSchema.parse({
    sourceMode: row.sourceMode,
    orderIds: row.orderIds,
    title: row.title,
    generatedItems: row.generatedItems,
    draftItems: row.draftItems,
    orders: row.ordersSnapshot,
  });
}

export async function shoppingListOrderRequirements(db: Reader, orderIds: number[]) {
  if (!orderIds.length) return [];
  return db
    .select({
      orderId: orderLineItems.orderId,
      productId: orderLineItems.productId,
      quantity: sql<number>`sum(${orderLineItems.quantity})::integer`,
    })
    .from(orderLineItems)
    .where(inArray(orderLineItems.orderId, orderIds))
    .groupBy(orderLineItems.orderId, orderLineItems.productId);
}

export class ShoppingListAllocationReviewError extends Error {}

export const shoppingListAllocationReviewSchema = z
  .object({
    scopeKey: z.string().min(1).max(5000),
    revision: z.number().int().nonnegative(),
    productId: z.number().int().positive(),
    requestId: z.string().min(1).max(200),
    orders: z
      .array(
        z
          .object({
            orderId: z.number().int().positive(),
            quantity: z.number().int().nonnegative().max(999999),
          })
          .strict(),
      )
      .max(MAX_SHOPPING_LIST_ENTRIES),
    manualQuantity: z.number().int().nonnegative().max(999999),
  })
  .strict();

export type ShoppingListAllocationReview = {
  reviews: Array<{
    scopeKey: string;
    revision: number;
    title: string;
    products: Array<{
      productId: number;
      title: string;
      recordedQuantity: number;
      manualAppliedQuantity: number;
      orders: Array<{ orderId: number; requiredQuantity: number; currentAppliedQuantity: number }>;
    }>;
  }>;
};
