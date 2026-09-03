import { and, eq, gte, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { products } from '@bric/db/schema';
import {
  mutateEntityWithHistoryTransaction,
  type ActionActor,
  type Transaction,
} from './action-history';

type Database = ReturnType<typeof getDb>;
type InventoryRow = Pick<
  typeof products.$inferSelect,
  | 'id'
  | 'title'
  | 'sku'
  | 'barcode'
  | 'inStock'
  | 'availabilityStatus'
  | 'inventoryQuantity'
  | 'updatedAt'
>;

class InventoryQuantityConflictError extends Error {}

export function buildInventoryRowSelection() {
  return {
    id: products.id,
    title: products.title,
    sku: products.sku,
    barcode: products.barcode,
    inStock: products.inStock,
    availabilityStatus: products.availabilityStatus,
    inventoryQuantity: products.inventoryQuantity,
    updatedAt: products.updatedAt,
  };
}

export async function readInventoryProductById(db: Database, id: number) {
  return db.query.products.findFirst({
    where: eq(products.id, id),
  });
}

export async function applyInventoryQuantityChange(
  db: Database,
  input: {
    productId: number;
    mode: 'increase' | 'decrease';
    quantity: number;
    actor?: ActionActor;
  },
) {
  return db.transaction((tx) => applyInventoryQuantityChangeInTransaction(tx, input));
}

export async function applyInventoryQuantityChangeInTransaction(
  tx: Transaction,
  input: {
    productId: number;
    mode: 'increase' | 'decrease';
    quantity: number;
    actor?: ActionActor;
  },
) {
  const delta = input.mode === 'increase' ? input.quantity : -input.quantity;
  const nextQuantity = sql<number>`${products.inventoryQuantity} + ${delta}`;
  let updated: InventoryRow | undefined;

  try {
    [updated] = await mutateEntityWithHistoryTransaction(tx, {
      entityType: 'products',
      entityId: input.productId,
      operation: 'update',
      actor: input.actor,
      execute: async (tx) => {
        const rows = await tx
          .update(products)
          .set({
            inventoryQuantity: nextQuantity,
            inStock: sql`${nextQuantity} > 0`,
            availabilityStatus: sql`case
              when ${nextQuantity} > 0 then 'in_stock'
              when nullif(${products.availabilityStatus}, '') is null
                or ${products.availabilityStatus} = 'in_stock' then 'out_of_stock'
              else ${products.availabilityStatus}
            end`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(products.id, input.productId),
              input.mode === 'decrease'
                ? gte(products.inventoryQuantity, input.quantity)
                : undefined,
            ),
          )
          .returning(buildInventoryRowSelection());

        if (rows.length === 0) {
          throw new InventoryQuantityConflictError();
        }

        return rows;
      },
    });
  } catch (error) {
    if (!(error instanceof InventoryQuantityConflictError)) {
      throw error;
    }

    const current = await tx.query.products.findFirst({
      where: eq(products.id, input.productId),
    });
    return current
      ? { kind: 'insufficient' as const, available: current.inventoryQuantity }
      : { kind: 'missing' as const };
  }

  const resolvedNextQuantity = updated!.inventoryQuantity;
  const previousQuantity = resolvedNextQuantity - delta;

  return {
    kind: 'updated' as const,
    previousQuantity,
    nextQuantity: resolvedNextQuantity,
    item: updated!,
  };
}
