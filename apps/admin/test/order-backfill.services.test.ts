import { getDb, getPool } from '@bric/db/client';
import { orderLineItems, orders, products } from '@bric/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';

import {
  backfillOrderCommercialSnapshots,
  backfillOrderNormalizedPhones,
} from '../lib/order-commercial-backfill';

afterAll(async () => {
  await getPool().end();
});

it('backfills persisted legacy orders across batches, preserves overrides and leaves unresolved rows retryable', async () => {
  const db = getDb();
  const [product] = await db
    .insert(products)
    .values({ title: 'Historical drill', slug: `backfill-${randomUUID()}`, price: '1000' })
    .returning();
  const rows = await db
    .insert(orders)
    .values([
      {
        phoneNumber1: '0555 12 34 56',
        cartProducts: [String(product!.id), String(product!.id)],
        deliveryFee: '400',
        price: '1800',
      },
      {
        phoneNumber1: 'not-a-phone',
        cartProducts: [`missing-${randomUUID()}`],
        deliveryFee: '500',
      },
      {
        phoneNumber1: '+213 666 12 34 56',
        cartProducts: [String(product!.id)],
        deliveryFee: '500',
      },
    ])
    .returning();
  const ids = rows.map((row) => row.id);
  const readRows = () => db.select().from(orders).where(inArray(orders.id, ids)).orderBy(orders.id);
  const readLines = () =>
    db
      .select()
      .from(orderLineItems)
      .where(inArray(orderLineItems.orderId, ids))
      .orderBy(orderLineItems.id);
  try {
    const commercial = await backfillOrderCommercialSnapshots(db, { batchSize: 1 });
    expect(commercial.unresolvedOrderIds).toContain(rows[1]!.id);
    const phones = await backfillOrderNormalizedPhones(db, { batchSize: 1 });
    expect(phones.invalidOrderIds).toContain(rows[1]!.id);
    const saved = await readRows();
    expect(saved).toMatchObject([
      {
        productSubtotal: '2000.00',
        price: '1800.00',
        totalAmount: '2200.00',
        normalizedPhone: '213555123456',
      },
      { productSubtotal: null, totalAmount: null, normalizedPhone: null },
      {
        productSubtotal: '1000.00',
        price: null,
        totalAmount: '1500.00',
        normalizedPhone: '213666123456',
      },
    ]);
    const lines = await readLines();
    expect(lines).toMatchObject([
      {
        orderId: rows[0]!.id,
        productId: product!.id,
        quantity: 2,
        effectiveUnitPrice: '1000.00',
        lineTotal: '2000.00',
      },
      {
        orderId: rows[2]!.id,
        productId: product!.id,
        quantity: 1,
        effectiveUnitPrice: '1000.00',
        lineTotal: '1000.00',
      },
    ]);
    await backfillOrderCommercialSnapshots(db, { batchSize: 1 });
    await backfillOrderNormalizedPhones(db, { batchSize: 1 });
    expect(await readRows()).toEqual(saved);
    expect(await readLines()).toEqual(lines);

    await db
      .update(orders)
      .set({ cartProducts: [String(product!.id)], phoneNumber1: '0777 12 34 56' })
      .where(eq(orders.id, rows[1]!.id));
    await backfillOrderCommercialSnapshots(db, { batchSize: 1 });
    await backfillOrderNormalizedPhones(db, { batchSize: 1 });
    expect((await readRows())[1]).toMatchObject({
      productSubtotal: '1000.00',
      totalAmount: '1500.00',
      normalizedPhone: '213777123456',
    });
  } finally {
    await db.delete(orders).where(inArray(orders.id, ids));
    await db.delete(products).where(eq(products.id, product!.id));
  }
});
