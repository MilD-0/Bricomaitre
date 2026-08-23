import { getDb } from '@bric/db/client';
import { z } from 'zod';

import { applyInventoryQuantityChange } from './inventory-actions';
import { CACHE_TAGS, revalidateServerTags } from './server-cache';
import { revalidateStorefrontProducts } from './storefront-revalidate';
import type { ActionActor } from './action-history';

export const adminAiInventoryAdjustmentSchema = z.object({
  mode: z.enum(['increase', 'decrease']),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(100),
});

export async function adjustAdminInventory(
  input: z.input<typeof adminAiInventoryAdjustmentSchema>,
  actor?: ActionActor,
) {
  const values = adminAiInventoryAdjustmentSchema.parse(input);
  const db = getDb();
  const items: Array<{ productId: number; previousQuantity: number; nextQuantity: number }> = [];
  const skipped: Array<{
    productId: number;
    reason: 'missing' | 'insufficient';
    available?: number;
  }> = [];

  for (const item of values.items) {
    const result = await applyInventoryQuantityChange(db, { ...item, mode: values.mode, actor });
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

  if (items.length > 0) {
    revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
    await revalidateStorefrontProducts();
  }

  return { ok: skipped.length === 0, items, skipped };
}
