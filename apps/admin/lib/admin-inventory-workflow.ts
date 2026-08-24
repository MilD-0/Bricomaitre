import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '@bric/db/client';
import { products } from '@bric/db/schema';

import { mutateEntityWithHistory, type ActionActor } from './action-history';
import { loadOrderDetail } from './admin-orders-data';
import {
  applyInventoryQuantityChange,
  buildInventoryRowSelection,
  readInventoryProductById,
} from './inventory-actions';
import {
  inventoryApplyRequestSchema,
  inventoryBarcodeSchema,
  inventoryScanQuerySchema,
} from './inventory';
import { CACHE_TAGS, revalidateServerTags } from './server-cache';
import { revalidateStorefrontProducts } from './storefront-revalidate';

type Database = ReturnType<typeof getDb>;

export class AdminInventoryNotFoundError extends Error {
  constructor(readonly productId: number) {
    super(`Product ${productId} was not found in inventory.`);
    this.name = 'AdminInventoryNotFoundError';
  }
}

export const adminInventoryStatePatchSchema = z
  .object({
    inStock: z.boolean().optional(),
    barcode: inventoryBarcodeSchema.shape.barcode.optional(),
  })
  .strict()
  .refine((changes) => changes.inStock !== undefined || changes.barcode !== undefined, {
    message: 'At least one inventory state field is required.',
  });

async function refreshInventoryConsumers() {
  revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  await revalidateStorefrontProducts();
}

export async function updateAdminInventoryProduct(
  db: Database,
  productId: number,
  input: z.input<typeof adminInventoryStatePatchSchema>,
  actor?: ActionActor,
) {
  const changes = adminInventoryStatePatchSchema.parse(input);
  const current = await readInventoryProductById(db, productId);
  if (!current) throw new AdminInventoryNotFoundError(productId);

  const [item] = await mutateEntityWithHistory(db, {
    entityType: 'products',
    entityId: productId,
    operation: 'update',
    actor,
    execute: (tx) =>
      tx
        .update(products)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(products.id, productId))
        .returning(buildInventoryRowSelection()),
  });
  if (!item) throw new AdminInventoryNotFoundError(productId);
  await refreshInventoryConsumers();
  return item;
}

export async function applyAdminInventoryBatch(
  db: Database,
  input: z.input<typeof inventoryApplyRequestSchema>,
  actor?: ActionActor,
) {
  const values = inventoryApplyRequestSchema.parse(input);
  const items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }> = [];
  const skipped: Array<{
    productId: number;
    reason: 'missing' | 'insufficient';
    available?: number;
  }> = [];

  for (const item of values.items) {
    const result = await applyInventoryQuantityChange(db, {
      productId: item.productId,
      mode: values.mode,
      quantity: item.quantity,
      actor,
    });
    if (result.kind === 'updated') {
      items.push({
        productId: item.productId,
        previousQuantity: result.previousQuantity,
        nextQuantity: result.nextQuantity,
      });
    } else if (result.kind === 'insufficient') {
      skipped.push({
        productId: item.productId,
        reason: 'insufficient',
        available: result.available,
      });
    } else {
      skipped.push({ productId: item.productId, reason: 'missing' });
    }
  }

  if (items.length > 0) await refreshInventoryConsumers();
  return { ok: true as const, complete: skipped.length === 0, items, skipped };
}

function isExactNumeric(value: string) {
  return /^\d+$/.test(value);
}

export async function inspectAdminInventoryScan(
  db: Database,
  input: z.input<typeof inventoryScanQuerySchema>,
) {
  const { query } = inventoryScanQuerySchema.parse(input);

  if (isExactNumeric(query)) {
    const order = await loadOrderDetail(Number(query));
    if (order) {
      const productIds = [
        ...new Set(
          order.orderProducts
            .map((item) => item.productId)
            .filter((item): item is number => item != null),
        ),
      ];
      const productRows =
        productIds.length > 0
          ? await db
              .select({ id: products.id, inventoryQuantity: products.inventoryQuantity })
              .from(products)
              .where(inArray(products.id, productIds))
          : [];
      const inventoryById = new Map(productRows.map((item) => [item.id, item.inventoryQuantity]));

      return {
        kind: 'order' as const,
        order: { id: order.id, fullName: order.fullName },
        items: order.orderProducts.map((item) =>
          item.productId == null
            ? {
                productId: null,
                title: item.title,
                quantity: item.quantity,
                inventoryQuantity: null,
                selectable: false,
                reason: 'Missing catalog match.',
              }
            : {
                productId: item.productId,
                title: item.title,
                quantity: item.quantity,
                inventoryQuantity: inventoryById.get(item.productId) ?? 0,
                selectable: true,
              },
        ),
      };
    }
  }

  const [item] = await db
    .select(buildInventoryRowSelection())
    .from(products)
    .where(eq(products.barcode, query))
    .limit(1);
  return item ? { kind: 'barcode' as const, item } : { kind: 'none' as const };
}
