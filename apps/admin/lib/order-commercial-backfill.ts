import { and, asc, gt, isNull } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { resolveOrderCommercialState } from '@bric/storefront-core/order-commercial';
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';

type Database = ReturnType<typeof getDb>;
type BackfillRow = Pick<
  typeof orders.$inferSelect,
  'id' | 'cartProducts' | 'promoCode' | 'deliveryFee' | 'price'
>;

export type OrderCommercialBackfillResult = {
  scanned: number;
  backfilled: number;
  unresolvedOrderIds: number[];
};

export type OrderPhoneBackfillResult = {
  scanned: number;
  backfilled: number;
  invalidOrderIds: number[];
};

function requestedItemCount(row: BackfillRow) {
  return (row.cartProducts ?? []).filter((value) => value.trim().length > 0).length;
}

export async function backfillOrderCommercialSnapshots(
  db: Database,
  options: { batchSize?: number } = {},
): Promise<OrderCommercialBackfillResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 1_000);

  let cursor = 0;
  let scanned = 0;
  let backfilled = 0;
  const unresolvedOrderIds: number[] = [];

  while (true) {
    const batch = await db
      .select({
        id: orders.id,
        cartProducts: orders.cartProducts,
        promoCode: orders.promoCode,
        deliveryFee: orders.deliveryFee,
        price: orders.price,
      })
      .from(orders)
      .where(and(gt(orders.id, cursor), isNull(orders.productSubtotal)))
      .orderBy(asc(orders.id))
      .limit(batchSize);
    if (batch.length === 0) break;

    for (const row of batch) {
      cursor = row.id;
      scanned += 1;
      const commercial = await resolveOrderCommercialState(db, {
        cartProducts: row.cartProducts ?? [],
        promoCode: row.promoCode,
      });
      const resolvedCount = commercial.lines.reduce((sum, line) => sum + line.quantity, 0);
      if (resolvedCount !== requestedItemCount(row)) {
        unresolvedOrderIds.push(row.id);
        continue;
      }
      const deliveryFee = Number(row.deliveryFee ?? 0);
      const subtotalOverride = row.price == null ? null : Number(row.price);
      await db.transaction((tx) =>
        updateCanonicalOrder(tx, {
          orderId: row.id,
          commercial,
          deliveryFee,
          totals: { productSubtotal: commercial.productSubtotal, deliveryFee, subtotalOverride },
        }),
      );
      backfilled += 1;
    }
  }

  return { scanned, backfilled, unresolvedOrderIds };
}

export async function backfillOrderNormalizedPhones(
  db: Database,
  options: { batchSize?: number } = {},
): Promise<OrderPhoneBackfillResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 250, 1), 1_000);
  let cursor = 0;
  let scanned = 0;
  let backfilled = 0;
  const invalidOrderIds: number[] = [];

  while (true) {
    const batch = await db
      .select({ id: orders.id, phoneNumber1: orders.phoneNumber1 })
      .from(orders)
      .where(and(gt(orders.id, cursor), isNull(orders.normalizedPhone)))
      .orderBy(asc(orders.id))
      .limit(batchSize);
    if (batch.length === 0) break;

    for (const row of batch) {
      cursor = row.id;
      scanned += 1;
      const normalizedPhone = normalizeAlgeriaPhone(row.phoneNumber1);
      if (!normalizedPhone) {
        invalidOrderIds.push(row.id);
        continue;
      }
      await db.transaction((tx) =>
        updateCanonicalOrder(tx, { orderId: row.id, values: { normalizedPhone } }),
      );
      backfilled += 1;
    }
  }

  return { scanned, backfilled, invalidOrderIds };
}
