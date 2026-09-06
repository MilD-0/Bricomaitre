import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { getDb, getPool } from '@bric/db/client';
import {
  importBatches,
  orderLineItems,
  orders,
  processedOrderProducts,
  processedOrders,
  products,
} from '@bric/db/schema';
import { deleteImportBatch, importStatsSpreadsheet } from '../lib/stats-order-import';

afterAll(async () => {
  await getPool().end();
});

it('imports captured unit economics and retains incomplete settlements for correction and reimport', async () => {
  const db = getDb();
  const key = randomUUID();
  const [product] = await db
    .insert(products)
    .values({ title: 'Changed catalog', slug: key, price: '3000', purchasePrice: '900' })
    .returning();
  const orderRows = await db
    .insert(orders)
    .values([
      { phoneNumber1: '0550000001', cartProducts: [String(product!.id), String(product!.id)] },
      { phoneNumber1: '0550000002', cartProducts: [String(product!.id)] },
      { phoneNumber1: '0550000003', cartProducts: [String(product!.id), `missing-${key}`] },
      { phoneNumber1: '0550000004', cartProducts: [`deleted-${key}`] },
    ])
    .returning();
  const ids = orderRows.map((order) => order.id);
  const batches: string[] = [];
  const trackings = ids.map((id) => `settlement-${key}-${id}`);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Référence', 'Tracking', 'Montant', 'Frais de livraison', 'Net recouvrement', 'Remarque'],
      ...ids.map((id, index) => [
        String(id),
        trackings[index],
        1500,
        200,
        1300,
        'Original carrier note',
      ]),
    ]),
    'Settlement',
  );
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  try {
    await db.insert(orderLineItems).values(
      [0, 1, 3].map((index) => ({
        orderId: ids[index]!,
        productId: index === 3 ? null : product!.id,
        contentId: `captured-${index}`,
        rawValue: `captured-${index}`,
        titleSnapshot: `Purchased title ${index}`,
        originalUnitPrice: '500',
        effectiveUnitPrice: '400',
        unitPurchasePriceSnapshot: index === 1 ? null : index === 3 ? '0' : '100',
        quantity: index === 0 ? 2 : 1,
        lineTotal: index === 0 ? '800' : '400',
      })),
    );
    const first = await importStatsSpreadsheet(buffer, `${key}.xlsx`);
    batches.push(first.batchId);
    expect(first).toMatchObject({
      newOrders: 2,
      duplicateOrders: 0,
      unmatchedReferences: [String(ids[1]), String(ids[2])],
    });
    const settlements = await db
      .select()
      .from(processedOrders)
      .where(inArray(processedOrders.tracking, trackings));
    expect(settlements).toHaveLength(2);
    const captured = settlements.find((row) => row.tracking === trackings[0])!;
    expect(captured).toMatchObject({ productCost: '200.00', profit: '1100.00' });
    const children = await db
      .select()
      .from(processedOrderProducts)
      .where(eq(processedOrderProducts.processedOrderId, captured.id));
    expect(children).toHaveLength(2);
    for (const child of children)
      expect(child).toMatchObject({ title: 'Purchased title 0', price: '400.00', cost: '100.00' });
    const deleted = settlements.find((row) => row.tracking === trackings[3])!;
    expect(deleted).toMatchObject({ productCost: '0.00', profit: '1300.00' });
    const [deletedChild] = await db
      .select()
      .from(processedOrderProducts)
      .where(eq(processedOrderProducts.processedOrderId, deleted.id));
    expect(deletedChild).toMatchObject({
      productId: null,
      title: 'Purchased title 3',
      cost: '0.00',
    });
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.batchId, first.batchId));
    expect(batch!.unmatchedDetails).toEqual([
      expect.objectContaining({
        reference: String(ids[1]),
        tracking: trackings[1],
        reason: 'missing_cost',
        note: 'Original carrier note',
      }),
      expect.objectContaining({
        reference: String(ids[2]),
        tracking: trackings[2],
        reason: 'unknown_product',
        note: 'Original carrier note',
      }),
    ]);
    // Correct the missing evidence, then retry the original file. Deferred rows have no financial receipt yet.
    await db
      .update(orderLineItems)
      .set({ unitPurchasePriceSnapshot: '150' })
      .where(eq(orderLineItems.orderId, ids[1]!));
    await db
      .update(orders)
      .set({ cartProducts: [String(product!.id)] })
      .where(eq(orders.id, ids[2]!));
    const retry = await importStatsSpreadsheet(buffer, `${key}.xlsx`);
    batches.push(retry.batchId);
    expect(retry).toMatchObject({ newOrders: 2, duplicateOrders: 2, unmatchedReferences: [] });
    const retried = await db
      .select()
      .from(processedOrders)
      .where(inArray(processedOrders.tracking, [trackings[1]!, trackings[2]!]));
    expect(retried.find((row) => row.tracking === trackings[1])).toMatchObject({
      productCost: '150.00',
      profit: '1150.00',
    });
    expect(retried.find((row) => row.tracking === trackings[2])).toMatchObject({
      productCost: '900.00',
      profit: '400.00',
    });
  } finally {
    for (const batch of batches) await deleteImportBatch(batch);
    await db.delete(orders).where(inArray(orders.id, ids));
    await db.delete(products).where(eq(products.id, product!.id));
  }
});
