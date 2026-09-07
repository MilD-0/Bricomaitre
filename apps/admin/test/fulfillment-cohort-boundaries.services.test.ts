import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import { createDb, getDb, getPool } from '@bric/db/client';
import { refreshAnalyticsFacts } from '../lib/analytics-facts';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import {
  orders,
  analyticsOrderCohortFacts,
  analyticsEconomicsDailyFacts,
  orderStatusHistory,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
} from '@bric/db/schema';
import {
  loadAutomaticPaidEconomics,
  loadFulfillmentSummary,
} from '../lib/analytics/fulfillment-economics';
import { loadCommandView } from '../lib/analytics/command-money-views';
import { resolveAnalyticsFilters } from '../lib/analytics/date-range';

afterAll(async () => getPool().end());

it('keeps one submission cohort across the funnel while retaining posting activity totals', async () => {
  const db = getDb();
  const [order] = await db
    .insert(orders)
    .values({
      firstName: 'Cohort boundary',
      phoneNumber1: '0550000101',
      createdAt: new Date('2042-09-01T10:00:00Z'),
      inHouseStatus: ORDER_STATUS.COMPLETED,
      totalAmount: '1000',
    })
    .returning();
  const tracking = randomUUID();
  try {
    await db.insert(orderStatusHistory).values([
      { orderId: order!.id, status: 2, changedAt: new Date('2042-09-02T10:00:00Z') },
      { orderId: order!.id, status: 11, changedAt: new Date('2042-09-08T10:00:00Z') },
    ]);
    await db.insert(ecotrackOrderStates).values({
      orderId: order!.id,
      reference: String(order!.id),
      trackingNumber: tracking,
      currentStatus: 'paye_et_archive',
      currentAmount: '1000',
      currentAmountSource: 'ecotrack_orders',
      deliveryTariff: '100',
    });
    await db.insert(ecotrackOrderTrackingEvents).values({
      orderId: order!.id,
      trackingNumber: tracking,
      eventDate: '2042-09-08',
      eventTime: '23:30',
      status: 'payed',
      raw: {},
    });
    const postingDay = await loadFulfillmentSummary(db, '2042-09-08', '2042-09-08');
    expect(postingDay).toMatchObject({
      submittedOrders: 0,
      confirmedOrders: 0,
      postedOrders: 1,
      paidOrders: 1,
      submissionCohort: {
        submittedOrders: 0,
        confirmedOrders: 0,
        postedOrders: 0,
        deliveredOrders: 0,
        paidOrders: 0,
      },
    });
    const command = await loadCommandView(
      db,
      resolveAnalyticsFilters({
        view: 'command',
        range: 'custom',
        startDate: '2042-09-08',
        endDate: '2042-09-08',
      }),
      {
        orders: '2042-09-08',
        ordersFrom: '2042-09-01',
        posted: '2042-09-08',
        postedFrom: '2042-09-08',
        ecotrack: '2042-09-08',
        ecotrackFrom: '2042-09-08',
        paidFrom: '2042-09-08',
        meta: null,
        metaFrom: null,
        storefront: null,
        storefrontFrom: null,
      },
      new Date('2042-09-09T12:00:00Z'),
    );
    expect(command.data.fulfillment.funnelDateBasis).toBe('order_created_at');
    expect(command.data.fulfillment.shipmentDateBasis).toBe('first_posted_at');
    expect(command.data.fulfillment.funnel).toEqual([
      { key: 'submitted', value: 0 },
      { key: 'confirmed', value: 0 },
      { key: 'posted', value: 0 },
      { key: 'delivered', value: 0 },
      { key: 'paid', value: 0 },
    ]);
    const submissionDay = await loadFulfillmentSummary(db, '2042-09-01', '2042-09-01');
    expect(submissionDay).toMatchObject({
      postedOrders: 0,
      submissionCohort: {
        submittedOrders: 1,
        confirmedOrders: 1,
        postedOrders: 1,
        deliveredOrders: 1,
        paidOrders: 1,
      },
    });
  } finally {
    await db.delete(orders).where(eq(orders.id, order!.id));
  }
});

it('assigns provider-local paid events to their Algerian date independent of the database timezone', async () => {
  const db = getDb();
  const [order] = await db
    .insert(orders)
    .values({
      firstName: 'Paid boundary',
      phoneNumber1: '0550000102',
      totalAmount: '1000',
      createdAt: new Date('2043-09-08T10:00:00Z'),
      inHouseStatus: ORDER_STATUS.COMPLETED,
    })
    .returning();
  const tracking = randomUUID();
  try {
    await db.insert(ecotrackOrderStates).values({
      orderId: order!.id,
      reference: String(order!.id),
      trackingNumber: tracking,
      currentStatus: 'paye_et_archive',
      currentAmount: '1000',
      currentAmountSource: 'ecotrack_orders',
      deliveryTariff: '100',
    });
    await db.insert(ecotrackOrderTrackingEvents).values({
      orderId: order!.id,
      trackingNumber: tracking,
      eventDate: '2043-09-08',
      eventTime: '23:30',
      status: 'payed',
      raw: {},
    });
    const filters = resolveAnalyticsFilters({
      view: 'money',
      range: 'custom',
      startDate: '2043-09-08',
      endDate: '2043-09-09',
    });
    await db.insert(orderStatusHistory).values({
      orderId: order!.id,
      status: ORDER_STATUS.POSTED,
      changedAt: new Date('2043-09-08T10:00:00Z'),
    });
    for (const timezone of ['UTC', 'Africa/Algiers', 'America/Los_Angeles']) {
      const sessionDb = createDb({ max: 1, options: `-c timezone=${timezone}` });
      try {
        const paid = await loadAutomaticPaidEconomics(sessionDb, filters);
        expect(paid.days).toEqual([
          expect.objectContaining({ date: '2043-09-08', paidOrders: 1, codDzd: 1000 }),
        ]);
        await refreshAnalyticsFacts({
          db: sessionDb,
          startDate: filters.startDate,
          endDate: filters.endDate,
        });
        const [cohortFact] = await sessionDb
          .select()
          .from(analyticsOrderCohortFacts)
          .where(eq(analyticsOrderCohortFacts.orderId, order!.id));
        expect(cohortFact?.paidAt?.toISOString()).toBe('2043-09-08T22:30:00.000Z');
        const [dailyFact] = await sessionDb
          .select()
          .from(analyticsEconomicsDailyFacts)
          .where(eq(analyticsEconomicsDailyFacts.day, '2043-09-08'));
        expect(dailyFact?.paidOrders).toBe(1);
      } finally {
        await sessionDb.$client.end();
      }
    }
  } finally {
    await db
      .delete(analyticsEconomicsDailyFacts)
      .where(inArray(analyticsEconomicsDailyFacts.day, ['2043-09-08', '2043-09-09']));
    await db.delete(orders).where(eq(orders.id, order!.id));
  }
});
