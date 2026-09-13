import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  ecotrackServiceFees,
  ecotrackWilayas,
  orderLineItems,
  orders,
  products,
} from '@bric/db/schema';
import { storefrontOrderCreateRequestSchema } from '@bric/storefront-core/contracts';
import { UnorderableCartError } from '@bric/storefront-core/order-commercial';
import { createStorefrontOrder, readCommittedStorefrontOrder } from '@bric/storefront-core/orders';
import { createAdminOrder } from '../lib/admin-order-lifecycle';
import { updateAdminOrder } from '../lib/admin-order-update';

vi.mock('../lib/reporting-refresh-trigger', () => ({ triggerAdminReportingRefresh: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
afterAll(() => getPool().end());

it('persists weighted delivery, retains accepted snapshots and recalculates edited quantities', async () => {
  const db = getDb();
  const runId = randomUUID();
  const wilayaId = 57;
  const feeWhere = and(
    eq(ecotrackServiceFees.wilayaId, wilayaId),
    eq(ecotrackServiceFees.serviceType, 'livraison'),
  );
  const [previousWilaya] = await db
    .select()
    .from(ecotrackWilayas)
    .where(eq(ecotrackWilayas.wilayaId, wilayaId));
  const [previousFee] = await db.select().from(ecotrackServiceFees).where(feeWhere);
  const createdProducts = await db
    .insert(products)
    .values([
      { title: 'Weighted tool', slug: `${runId}-weighted`, price: '1200', weightKg: '3.100' },
      { title: 'Unknown weight', slug: `${runId}-unknown`, price: '100' },
    ])
    .returning();
  const [weighted, unknown] = createdProducts;
  const orderIds: number[] = [];
  await db.insert(ecotrackWilayas).values({ wilayaId, name: runId }).onConflictDoNothing();
  await db
    .insert(ecotrackServiceFees)
    .values({ wilayaId, serviceType: 'livraison', homeFee: '600', stopDeskFee: '350' })
    .onConflictDoUpdate({
      target: [ecotrackServiceFees.serviceType, ecotrackServiceFees.wilayaId],
      set: { homeFee: '600', stopDeskFee: '350' },
    });
  const payload = storefrontOrderCreateRequestSchema.parse({
    phoneNumber1: '0550000123',
    state: wilayaId,
    city: 'Test commune',
    homeAddress: 'Test address',
    cartProducts: [String(weighted!.id), String(weighted!.id), String(unknown!.id)],
    expectedProductSubtotal: 2500,
    expectedWeightKg: 6.2,
  });
  try {
    const created = await createStorefrontOrder(db, payload);
    orderIds.push(created.item.id);
    expect(created.item).toMatchObject({
      productSubtotal: 2500,
      deliveryFee: 700,
      totalAmount: 3200,
    });
    expect(created.item.orderProducts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: weighted!.id, weightKg: 3.1, quantity: 2 }),
        expect.objectContaining({ productId: unknown!.id, weightKg: null, quantity: 1 }),
      ]),
    );
    const snapshots = await db
      .select()
      .from(orderLineItems)
      .where(eq(orderLineItems.orderId, created.item.id));
    expect(snapshots.find((line) => line.productId === weighted!.id)?.weightKgSnapshot).toBe(
      '3.100',
    );
    const adminCreated = await createAdminOrder(db, { ...payload, delivery: 1 });
    orderIds.push(adminCreated.item.id);
    expect(adminCreated.item).toMatchObject({ deliveryFee: 450, totalAmount: 2950 });

    await db.update(products).set({ weightKg: '20.000' }).where(eq(products.id, weighted!.id));
    expect(await readCommittedStorefrontOrder(db, created.item.id)).toMatchObject({
      deliveryFee: 700,
      totalAmount: 3200,
    });
    const moved = await updateAdminOrder(db, created.item.id, { delivery: 1 });
    expect(moved).toMatchObject({ deliveryFee: 450, totalAmount: 2950 });
    await expect(createStorefrontOrder(db, payload)).rejects.toBeInstanceOf(UnorderableCartError);

    await db.update(products).set({ weightKg: '3.100' }).where(eq(products.id, weighted!.id));
    const reduced = await updateAdminOrder(db, created.item.id, {
      cartProducts: [String(weighted!.id)],
    });
    expect(reduced).toMatchObject({ deliveryFee: 350, productSubtotal: 1200, totalAmount: 1550 });
    const increased = await updateAdminOrder(db, created.item.id, {
      cartProducts: Array(3).fill(String(weighted!.id)),
    });
    expect(increased).toMatchObject({ deliveryFee: 600, productSubtotal: 3600, totalAmount: 4200 });
    const cleared = await updateAdminOrder(db, created.item.id, {
      cartProducts: [String(unknown!.id)],
    });
    expect(cleared).toMatchObject({ deliveryFee: 350, productSubtotal: 100, totalAmount: 450 });
  } finally {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    await db.delete(products).where(
      inArray(
        products.id,
        createdProducts.map((product) => product.id),
      ),
    );
    if (previousFee) await db.update(ecotrackServiceFees).set(previousFee).where(feeWhere);
    else await db.delete(ecotrackServiceFees).where(feeWhere);
    if (!previousWilaya)
      await db.delete(ecotrackWilayas).where(eq(ecotrackWilayas.wilayaId, wilayaId));
  }
});
