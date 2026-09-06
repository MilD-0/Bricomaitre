import { and, asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  ecotrackServiceFees,
  ecotrackWilayas,
  orderLineItems,
  orderStatusHistory,
  orders,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { updateAdminOrder } from '../lib/admin-order-update';

const events = vi.hoisted(() => ({
  confirmed: vi.fn(),
  completed: vi.fn(),
  destinations: vi.fn(),
}));
vi.mock('@bric/storefront-core/meta', async (original) => ({
  ...(await original<typeof import('@bric/storefront-core/meta')>()),
  ensureOrderConfirmedEventForOrder: events.confirmed,
  ensureOrderCompletedEventForOrder: events.completed,
}));
vi.mock('@bric/storefront-core/marketing', async (original) => ({
  ...(await original<typeof import('@bric/storefront-core/marketing')>()),
  ensureMarketingOrderStatusEvents: events.destinations,
}));
vi.mock('../lib/reporting-refresh-trigger', () => ({ triggerAdminReportingRefresh: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }));
afterAll(async () => {
  await getPool().end();
});

it('persists degraded capture completion, delivery/cart totals and lifecycle history despite optional event failure', async () => {
  const db = getDb();
  const runId = randomUUID();
  const actor = { email: `lifecycle-${runId}@example.invalid`, name: 'Operator' };
  const wilayaId = 58;
  const [previousWilaya] = await db
    .select()
    .from(ecotrackWilayas)
    .where(eq(ecotrackWilayas.wilayaId, wilayaId));
  const feeWhere = and(
    eq(ecotrackServiceFees.wilayaId, wilayaId),
    eq(ecotrackServiceFees.serviceType, 'livraison'),
  );
  const [previousFee] = await db.select().from(ecotrackServiceFees).where(feeWhere);
  const [product] = await db
    .insert(products)
    .values({ title: 'Snapshot product', slug: runId, price: '1200' })
    .returning();
  const [order] = await db
    .insert(orders)
    .values({
      phoneNumber1: '0550000111',
      variant: 'degraded_capture',
      cartProducts: [],
      delivery: 0,
    })
    .returning();
  await db.insert(ecotrackWilayas).values({ wilayaId, name: runId }).onConflictDoNothing();
  await db
    .insert(ecotrackServiceFees)
    .values({ wilayaId, serviceType: 'livraison', homeFee: '600', stopDeskFee: '350' })
    .onConflictDoUpdate({
      target: [ecotrackServiceFees.serviceType, ecotrackServiceFees.wilayaId],
      set: { homeFee: '600', stopDeskFee: '350' },
    });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  events.confirmed.mockRejectedValue(new Error('optional confirmation destination unavailable'));
  events.completed.mockResolvedValue({ created: true });
  events.destinations.mockResolvedValue({ created: true });
  try {
    const completeCapture = await updateAdminOrder(
      db,
      order!.id,
      {
        cartProducts: [String(product!.id), String(product!.id)],
        delivery: 1,
        state: wilayaId,
        city: 'Test commune',
      },
      actor,
    );
    expect(completeCapture.variant).toBeNull();
    const [saved] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(saved).toMatchObject({
      productSubtotal: '2400.00',
      deliveryFee: '350.00',
      totalAmount: '2750.00',
      variant: null,
    });
    expect(
      await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, order!.id)),
    ).toEqual([
      expect.objectContaining({
        productId: product!.id,
        quantity: 2,
        effectiveUnitPrice: '1200.00',
      }),
    ]);
    await updateAdminOrder(db, order!.id, { inHouseStatus: ORDER_STATUS.CONFIRMED }, actor);
    const confirmed = await db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order!.id))
      .orderBy(asc(orderStatusHistory.changedAt));
    const confirmation = confirmed.find((row) => row.status === ORDER_STATUS.CONFIRMED)!;
    expect(confirmation).toMatchObject({ changedBy: actor.email, changedByName: actor.name });
    expect(events.confirmed).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ orderId: order!.id, statusHistoryId: confirmation.id }),
    );
    expect(events.destinations).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ statusHistoryId: confirmation.id }),
    );
    expect(log).toHaveBeenCalled();
    await updateAdminOrder(db, order!.id, { inHouseStatus: ORDER_STATUS.MANUAL_COMPLETED }, actor);
    const [firstCompletion] = await db
      .select()
      .from(orderStatusHistory)
      .where(
        and(
          eq(orderStatusHistory.orderId, order!.id),
          eq(orderStatusHistory.status, ORDER_STATUS.MANUAL_COMPLETED),
        ),
      );
    await updateAdminOrder(db, order!.id, { inHouseStatus: ORDER_STATUS.COMPLETED }, actor, {
      allowStatusCorrection: true,
    });
    expect(events.completed).toHaveBeenCalledTimes(2);
    for (const [, event] of events.completed.mock.calls) {
      expect(event).toMatchObject({
        orderId: order!.id,
        statusHistoryId: firstCompletion!.id,
        status: ORDER_STATUS.MANUAL_COMPLETED,
      });
    }
    const [final] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(final!.inHouseStatus).toBe(ORDER_STATUS.COMPLETED);
    const audits = await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    expect(audits).toHaveLength(4);
    expect(audits.every((row) => row.entityId === order!.id && row.operation === 'update')).toBe(
      true,
    );
  } finally {
    log.mockRestore();
    await db.delete(orders).where(eq(orders.id, order!.id));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    await db.delete(products).where(eq(products.id, product!.id));
    if (previousFee) await db.update(ecotrackServiceFees).set(previousFee).where(feeWhere);
    else await db.delete(ecotrackServiceFees).where(feeWhere);
    if (!previousWilaya)
      await db.delete(ecotrackWilayas).where(eq(ecotrackWilayas.wilayaId, wilayaId));
  }
});
