import { eq } from 'drizzle-orm';

import { getDb } from '../db/client';
import { products } from '../db/schema';
import { mutateEntityWithHistory, type ActionActor } from './action-history';

type Database = ReturnType<typeof getDb>;

export type InventoryProductRecord = {
  id: number;
  title: string;
  sku: string | null;
  barcode: string | null;
  inStock: boolean;
  availabilityStatus: string;
  inventoryQuantity: number;
  updatedAt: Date;
};

function normalizeAvailability(nextQuantity: number, currentStatus: string) {
  if (nextQuantity > 0) {
    return {
      inStock: true,
      availabilityStatus: 'in_stock',
    };
  }

  return {
    inStock: false,
    availabilityStatus: currentStatus === 'in_stock' ? 'out_of_stock' : currentStatus || 'out_of_stock',
  };
}

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
  const current = await readInventoryProductById(db, input.productId);

  if (!current) {
    return { kind: 'missing' as const };
  }

  const previousQuantity = current.inventoryQuantity;
  const nextQuantity = input.mode === 'increase'
    ? previousQuantity + input.quantity
    : Math.max(0, previousQuantity - input.quantity);
  const stockValues = normalizeAvailability(nextQuantity, current.availabilityStatus);

  const [updated] = await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: input.productId,
    operation: 'update',
    actor: input.actor,
    execute: (tx) => tx
      .update(products)
      .set({
        inventoryQuantity: nextQuantity,
        ...stockValues,
        updatedAt: new Date(),
      })
      .where(eq(products.id, input.productId))
      .returning(buildInventoryRowSelection()),
  });

  return {
    kind: 'updated' as const,
    previousQuantity,
    nextQuantity,
    item: updated,
  };
}
