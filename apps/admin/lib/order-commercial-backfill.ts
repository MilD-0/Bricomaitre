import { and, asc, gt, isNull } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import {
  resolveOrderCommercialState,
  type ResolvedOrderCommercialState,
} from '@bric/storefront-core/order-commercial';
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';

type Database = ReturnType<typeof getDb>;
type BackfillRow = Pick<
  typeof orders.$inferSelect,
  'id' | 'cartProducts' | 'promoCode' | 'delPr' | 'price'
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
  options: {
    batchSize?: number;
    resolveCommercial?: (db: Database, row: BackfillRow) => Promise<ResolvedOrderCommercialState>;
    persist?: (
      db: Database,
      row: BackfillRow,
      commercial: ResolvedOrderCommercialState,
    ) => Promise<void>;
  } = {},
): Promise<OrderCommercialBackfillResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 1_000);
  const resolveCommercial =
    options.resolveCommercial ??
    ((executor, row) =>
      resolveOrderCommercialState(executor, {
        cartProducts: row.cartProducts ?? [],
        promoCode: row.promoCode,
      }));
  const persist =
    options.persist ??
    (async (executor, row, commercial) => {
      const deliveryFee = Number(row.delPr ?? 0);
      const subtotalOverride = row.price == null ? null : Number(row.price);
      await executor.transaction((tx) =>
        updateCanonicalOrder(tx, {
          orderId: row.id,
          commercial,
          deliveryFee,
          totals: {
            productSubtotal: commercial.productSubtotal,
            deliveryFee,
            subtotalOverride,
          },
        }),
      );
    });

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
        delPr: orders.delPr,
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
      const commercial = await resolveCommercial(db, row);
      const resolvedCount = commercial.lines.reduce((sum, line) => sum + line.quantity, 0);
      if (resolvedCount !== requestedItemCount(row)) {
        unresolvedOrderIds.push(row.id);
        continue;
      }
      await persist(db, row, commercial);
      backfilled += 1;
    }
  }

  return { scanned, backfilled, unresolvedOrderIds };
}

export async function backfillOrderNormalizedPhones(
  db: Database,
  options: {
    batchSize?: number;
    persist?: (
      db: Database,
      row: Pick<typeof orders.$inferSelect, 'id' | 'phoneNumber1'>,
      normalizedPhone: string,
    ) => Promise<void>;
  } = {},
): Promise<OrderPhoneBackfillResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? 250, 1), 1_000);
  const persist =
    options.persist ??
    ((executor, row, normalizedPhone) =>
      executor
        .transaction((tx) =>
          updateCanonicalOrder(tx, {
            orderId: row.id,
            values: { normalizedPhone },
          }),
        )
        .then(() => undefined));
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
      await persist(db, row, normalizedPhone);
      backfilled += 1;
    }
  }

  return { scanned, backfilled, invalidOrderIds };
}
