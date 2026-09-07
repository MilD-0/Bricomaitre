import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  adminMutationIdempotency,
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orderLineItems,
  orderStatusHistory,
  orders,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';
import { loadDailyOrderStatusOverview } from '../lib/admin-orders-data';
import {
  AdminOrderLifecycleNotFoundError,
  createAdminOrder,
  deleteAdminOrder,
} from '../lib/admin-order-lifecycle';

const reporting = vi.hoisted(() => vi.fn());
vi.mock('../lib/reporting-refresh-trigger', () => ({ triggerAdminReportingRefresh: reporting }));

afterAll(async () => {
  await getPool().end();
});

it('counts the whole operating week in three source reads with Algiers boundaries and per-day shipment deduplication', async () => {
  const db = getDb();
  const marker = randomUUID();
  const createdAt = [
    '2088-02-07T23:00:00Z',
    '2088-02-07T22:59:59.999Z',
    '2088-02-01T23:00:00Z',
    '2088-02-01T22:59:59.999Z',
    '2088-02-08T23:00:00Z',
  ];
  const rows = await db
    .insert(orders)
    .values(
      createdAt.map((value) => ({
        phoneNumber1: '0550000123',
        createdAt: new Date(value),
      })),
    )
    .returning();
  const ids = rows.map((row) => row.id);
  const history = (index: number, status: number, at: string, name = 'Operator') => ({
    orderId: ids[index]!,
    status,
    changedAt: new Date(at),
    changedByName: name,
  });
  try {
    await db
      .insert(orderStatusHistory)
      .values([
        history(0, ORDER_STATUS.NO_ANSWER, '2088-02-07T23:00:00Z'),
        history(0, ORDER_STATUS.NO_ANSWER, '2088-02-08T00:30:00Z'),
        history(1, ORDER_STATUS.NO_ANSWER, '2088-02-08T01:00:00Z'),
        history(1, ORDER_STATUS.CONFIRMED, '2088-02-08T12:00:00Z'),
        history(1, ORDER_STATUS.CONFIRMED, '2088-02-08T13:00:00Z'),
        history(1, ORDER_STATUS.CANCELLED, '2088-02-08T14:00:00Z'),
        history(1, ORDER_STATUS.CANCELLED, '2088-02-08T15:00:00Z', 'ECOTRACK sync'),
        history(1, ORDER_STATUS.NO_ANSWER, '2088-02-07T22:59:59.999Z'),
        history(2, ORDER_STATUS.CONFIRMED, '2088-02-01T23:00:00Z'),
        history(3, ORDER_STATUS.CONFIRMED, '2088-02-01T22:59:59.999Z'),
        history(4, ORDER_STATUS.CONFIRMED, '2088-02-08T23:00:00Z'),
      ]);
    await db.insert(ecotrackOrderStates).values(
      ids.map((id, index) => ({
        orderId: id,
        trackingNumber: `${marker}-${index}`,
        reference: String(id),
        currentStatus: index === 1 ? 'en_livraison' : 'annule',
        lastActionAt: new Date(createdAt[index]!),
        updatedAt: new Date('2088-02-08T12:00:00Z'),
        rawStatusPayload:
          index === 0
            ? {
                activity: [
                  { date: '2088-02-07', time: '22:00:00' },
                  { date: '2088-02-07', time: '23:15:00' },
                ],
              }
            : {},
      })),
    );
    await db.insert(ecotrackOrderMajEntries).values([
      {
        orderId: ids[0]!,
        trackingNumber: marker,
        remarque: 'Call',
        remoteCreatedAt: new Date('2088-02-08T13:00:00Z'),
        raw: {},
      },
      {
        orderId: ids[1]!,
        trackingNumber: marker,
        remarque: 'Call',
        remoteCreatedAt: new Date('2088-02-07T22:59:00Z'),
        raw: {},
      },
      {
        orderId: ids[1]!,
        trackingNumber: marker,
        remarque: 'Future',
        remoteCreatedAt: new Date('2088-02-08T23:00:00Z'),
        raw: {},
      },
    ]);
    await db.insert(ecotrackOrderTrackingEvents).values([
      {
        orderId: ids[0]!,
        trackingNumber: marker,
        eventDate: '2088-02-08',
        eventTime: '13:00',
        status: 'livred',
        raw: {},
      },
      {
        orderId: ids[0]!,
        trackingNumber: marker,
        eventDate: '2088-02-08',
        eventTime: '14:00',
        status: 'payed',
        raw: {},
      },
      {
        orderId: ids[1]!,
        trackingNumber: marker,
        eventDate: '2088-02-08',
        eventTime: '09:00',
        status: 'attempt_delivery',
        raw: {},
      },
      {
        orderId: ids[3]!,
        trackingNumber: marker,
        eventDate: '2088-02-01',
        eventTime: '23:59',
        status: 'livred',
        raw: {},
      },
      {
        orderId: ids[4]!,
        trackingNumber: marker,
        eventDate: '2088-02-09',
        eventTime: '00:00',
        status: 'livred',
        raw: {},
      },
    ]);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2088-02-08T12:00:00Z'));
    const query = vi.spyOn(Client.prototype, 'query');
    try {
      const weekly = await loadDailyOrderStatusOverview({ reportDays: 7 });
      expect(query).toHaveBeenCalledTimes(3);
      if (!weekly.available) throw new Error('Expected available overview');
      expect(weekly.reports.map((day) => day.reportDay)).toEqual([
        '2088-02-08',
        '2088-02-07',
        '2088-02-06',
        '2088-02-05',
        '2088-02-04',
        '2088-02-03',
        '2088-02-02',
      ]);
      expect(weekly.reports[0]).toEqual({
        reportDay: '2088-02-08',
        newOrders: 1,
        confirmationStatusChanges: 7,
        confirmedToday: 2,
        noAnswerOrders: 2,
        adminCancelled: 1,
        carrierCancelled: 1,
        shipmentUpdates: 2,
      });
      expect(weekly.reports[1]).toMatchObject({
        newOrders: 1,
        confirmationStatusChanges: 1,
        noAnswerOrders: 1,
        carrierCancelled: 0,
        shipmentUpdates: 1,
      });
      expect(weekly.reports[2]).toEqual({
        reportDay: '2088-02-06',
        newOrders: 0,
        confirmationStatusChanges: 0,
        confirmedToday: 0,
        noAnswerOrders: 0,
        adminCancelled: 0,
        carrierCancelled: 0,
        shipmentUpdates: 0,
      });
      expect(weekly.reports[6]).toMatchObject({
        newOrders: 1,
        confirmedToday: 1,
        carrierCancelled: 1,
        shipmentUpdates: 1,
      });
      query.mockClear();
      const daily = await loadDailyOrderStatusOverview({ reportDays: 1 });
      expect(query).toHaveBeenCalledTimes(3);
      if (!daily.available) throw new Error('Expected available overview');
      expect(daily.reports).toEqual([weekly.reports[0]]);
      expect(daily.newOrders).toBe(weekly.reports[0]!.newOrders);
    } finally {
      query.mockRestore();
      vi.useRealTimers();
    }
  } finally {
    await db.delete(orders).where(inArray(orders.id, ids));
  }
});

it('creates captured order economics, public token and audit before deleting the exact order', async () => {
  const db = getDb();
  const marker = randomUUID();
  const actor = { email: `${marker}@example.invalid`, name: 'Operator' };
  const phone = '055' + marker.replace(/\D/g, '').slice(0, 7).padEnd(7, '1');
  const now = new Date('2088-03-01T12:00:00Z');
  const [product] = await db
    .insert(products)
    .values({
      slug: marker,
      title: 'Captured drill',
      price: '500',
      purchasePrice: '100',
      active: true,
    })
    .returning();
  const [duplicate] = await db
    .insert(orders)
    .values({
      phoneNumber1: phone,
      normalizedPhone: normalizeAlgeriaPhone(phone),
      createdAt: new Date(now.getTime() - 60_000),
    })
    .returning();
  let createdId: number | undefined;
  try {
    const result = await createAdminOrder(
      db,
      {
        firstName: 'Ahmed',
        lastName: 'Test',
        phoneNumber1: phone,
        cartProducts: [String(product!.id), String(product!.id)],
        delivery: 0,
        state: null,
        city: '',
        homeAddress: '',
      },
      actor,
      now,
    );
    createdId = result.item.id;
    expect(result.duplicateCandidates).toEqual([
      { id: duplicate!.id, createdAt: duplicate!.createdAt.toISOString() },
    ]);
    const [stored] = await db.select().from(orders).where(eq(orders.id, createdId));
    expect(stored).toMatchObject({
      productSubtotal: '1000.00',
      deliveryFee: '0.00',
      totalAmount: '1000.00',
      normalizedPhone: normalizeAlgeriaPhone(phone),
      variant: 'degraded_capture',
    });
    expect(stored!.publicToken).toBeTruthy();
    expect(stored!.publicTokenExpiresAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(
      await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, createdId)),
    ).toEqual([
      expect.objectContaining({
        productId: product!.id,
        titleSnapshot: 'Captured drill',
        quantity: 2,
        effectiveUnitPrice: '500.00',
        unitPurchasePriceSnapshot: '100.00',
        lineTotal: '1000.00',
      }),
    ]);
    const createdHistory = await db
      .select()
      .from(actionLogs)
      .where(eq(actionLogs.createdBy, actor.email));
    expect(createdHistory).toEqual([
      expect.objectContaining({ entityType: 'orders', entityId: createdId, operation: 'create' }),
    ]);
    expect(reporting).toHaveBeenCalledWith('order-create');
    expect(await deleteAdminOrder(db, createdId, actor)).toMatchObject({
      id: createdId,
      customerName: 'Ahmed Test',
    });
    expect(await db.select().from(orders).where(eq(orders.id, createdId))).toEqual([]);
    expect(
      await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, createdId)),
    ).toEqual([]);
    expect(await db.select().from(orders).where(eq(orders.id, duplicate!.id))).toHaveLength(1);
    const finalHistory = await db
      .select()
      .from(actionLogs)
      .where(eq(actionLogs.createdBy, actor.email));
    expect(finalHistory).toHaveLength(2);
    expect(finalHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'delete', entityId: createdId, isReversible: false }),
      ]),
    );
    expect(reporting).toHaveBeenCalledWith('order-delete');
    await expect(deleteAdminOrder(db, createdId, actor)).rejects.toBeInstanceOf(
      AdminOrderLifecycleNotFoundError,
    );
  } finally {
    await db
      .delete(orders)
      .where(inArray(orders.id, [duplicate!.id, ...(createdId ? [createdId] : [])]));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    await db.delete(products).where(eq(products.id, product!.id));
  }
});

it('commits phone creation once per attempt, including concurrent and lost-response replays, while allowing a new order', async () => {
  const db = getDb();
  const marker = randomUUID();
  const actor = { email: `phone-retry-${marker}@example.invalid`, name: 'Phone operator' };
  const requestId = randomUUID();
  const otherRequestId = randomUUID();
  const [product] = await db
    .insert(products)
    .values({ title: marker, slug: marker, price: '1200' })
    .returning();
  const input = {
    firstName: marker,
    phoneNumber1: '+213 550 123 456',
    cartProducts: [String(product!.id)],
    delivery: 0 as const,
  };
  const ids = new Set<number>();
  try {
    const [first, concurrent] = await Promise.all([
      createAdminOrder(db, input, actor, new Date(), requestId),
      createAdminOrder(db, input, actor, new Date(), requestId),
    ]);
    ids.add(first.item.id);
    ids.add(concurrent.item.id);
    expect(concurrent.item.id).toBe(first.item.id);
    await db.update(products).set({ price: '2400' }).where(eq(products.id, product!.id));
    const replay = await createAdminOrder(db, input, actor, new Date(), requestId);
    expect(replay.item.id).toBe(first.item.id);
    expect(replay.item.totalAmount).toBe(1200);
    expect(replay.duplicateCandidates).toEqual(first.duplicateCandidates);
    await expect(
      createAdminOrder(db, { ...input, note: 'changed payload' }, actor, new Date(), requestId),
    ).rejects.toThrow('different operation');
    const next = await createAdminOrder(db, input, actor, new Date(), otherRequestId);
    ids.add(next.item.id);
    expect(next.item.id).not.toBe(first.item.id);
    expect(next.item.totalAmount).toBe(2400);
    expect(next.duplicateCandidates).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.item.id })]),
    );
    const records = await db.select().from(orders).where(eq(orders.firstName, marker));
    expect(records).toHaveLength(2);
    expect(
      await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email)),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(orderLineItems)
        .where(inArray(orderLineItems.orderId, [...ids])),
    ).toHaveLength(2);
  } finally {
    await db
      .delete(adminMutationIdempotency)
      .where(eq(adminMutationIdempotency.scope, `phone-order-create:${actor.email}`));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    await db.delete(orders).where(eq(orders.firstName, marker));
    await db.delete(products).where(eq(products.id, product!.id));
  }
});
