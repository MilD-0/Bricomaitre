import { createDb } from '@bric/db/client';
import {
  analyticsEvents,
  analyticsJourneys,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orderLineItems,
  orders,
  products,
} from '@bric/db/schema';
import {
  backfillOrderAcquisitionAttributionBatch,
  backfillOrderAiInfluenceBatch,
  deleteExpiredPaidClickVisitsBatch,
  normalizeNextPaidClickRollupDays,
  runStorefrontDataMaintenanceBatch,
} from '@bric/storefront-core/maintenance';
import { asc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const namespace = `maintenance_${randomUUID().replaceAll('-', '')}`;
const db = createDb({ max: 2, options: `-c search_path=${namespace},public` });
const tables = [
  'order_status_history',
  'order_marketing_attribution',
  'order_meta_attribution',
  'storefront_settings',
  'products',
  'orders',
  'order_line_items',
  'order_acquisition_attribution',
  'order_ai_influence',
  'storefront_order_idempotency',
  'analytics_journeys',
  'analytics_sessions',
  'analytics_events',
  'analytics_paid_click_visits',
  'analytics_daily_rollups',
  'analytics_acquisition_daily_rollups',
  'analytics_ai_daily_rollups',
  'analytics_distinct_daily_members',
  'analytics_paid_click_daily_rollups',
  'meta_event_outbox',
  'meta_event_daily_rollups',
  'marketing_event_outbox',
];
const now = new Date('2026-09-01T12:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);

beforeAll(async () => {
  await db.execute(sql`create schema ${sql.identifier(namespace)}`);
  // Maintenance scans whole tables. Keep migrated columns, checks and indexes in
  // an isolated schema, plus actual foreign keys between the fixture tables.
  for (const table of tables) {
    await db.execute(sql`
      create table ${sql.identifier(namespace)}.${sql.identifier(table)}
      (like public.${sql.identifier(table)} including all)
    `);
  }
  const foreignKeys = await db.$client.query<{
    tablename: string;
    name: string;
    definition: string;
  }>(
    `select source.relname as tablename, constraint_row.conname as name,
      pg_get_constraintdef(constraint_row.oid) as definition
    from pg_constraint constraint_row
    join pg_class source on source.oid = constraint_row.conrelid
    join pg_class target on target.oid = constraint_row.confrelid
    where constraint_row.contype = 'f'
      and source.relnamespace = 'public'::regnamespace
      and target.relnamespace = 'public'::regnamespace
      and source.relname = any($1::text[]) and target.relname = any($1::text[])`,
    [tables],
  );
  for (const foreignKey of foreignKeys.rows) {
    await db.execute(sql`
      alter table ${sql.identifier(namespace)}.${sql.identifier(foreignKey.tablename)}
      add constraint ${sql.identifier(foreignKey.name)}
      ${sql.raw(foreignKey.definition.replaceAll('REFERENCES public.', `REFERENCES "${namespace}".`))}
    `);
  }
});
beforeEach(async () => {
  await db.execute(
    sql`truncate ${sql.join(
      tables.map((table) => sql`${sql.identifier(namespace)}.${sql.identifier(table)}`),
      sql`, `,
    )}`,
  );
});
afterAll(async () => {
  await db.execute(sql`drop schema ${sql.identifier(namespace)} cascade`);
  await db.$client.end();
});

function paidVisit(visitId: string, firstSeenAt = ago(8)) {
  return {
    visitId,
    firstSeenAt,
    lastSeenAt: firstSeenAt,
    landingUrl: 'https://bricomaitre.com/fr/products?fbclid=private-click',
    landingPath: '/fr/products?fbclid=private-click',
    fbclidRaw: 'private-click',
    userAgent: 'private-agent',
    paidSource: 'meta_utm',
    utmSource: ' Facebook ',
    utmMedium: ' Paid_Social ',
    utmCampaign: '123456',
    utmTerm: '234567',
    utmContent: '345678',
    expiresAt: ago(1),
  };
}

it('backfills bounded order attribution before deleting its expired paid-click evidence', async () => {
  await db
    .insert(analyticsPaidClickVisits)
    .values([
      paidVisit('first'),
      { ...paidVisit('second'), paidSource: 'fbclid', utmSource: null, utmMedium: null },
      paidVisit('recent', ago(1)),
      paidVisit('outside-order-window'),
    ]);
  const savedOrders = await db
    .insert(orders)
    .values([
      { phoneNumber1: '0550000001', visitId: 'first', createdAt: ago(8) },
      { phoneNumber1: '0550000002', visitId: 'second', createdAt: ago(8) },
      { phoneNumber1: '0550000003', visitId: 'outside-order-window', createdAt: now },
    ])
    .returning();

  // Neither an unrolled day nor an order without attribution can lose raw evidence.
  expect(await deleteExpiredPaidClickVisitsBatch(db, { now })).toBe(0);
  const first = await runStorefrontDataMaintenanceBatch(db, { now, limit: 1 });
  expect(first).toMatchObject({ orderAcquisitionBackfilled: 1, paidClicks: 1 });
  expect(await db.select().from(orderAcquisitionAttribution)).toEqual([
    expect.objectContaining({
      orderId: savedOrders[0]!.id,
      attributionModel: 'legacy_visit_backfill',
      channel: 'meta_paid',
      evidence: 'paid_utm',
      landingPath: '/fr/products',
      metaCampaignId: '123456',
      metaAdsetId: '234567',
      metaAdId: '345678',
    }),
  ]);
  expect(
    (await db.select().from(analyticsPaidClickVisits)).map((row) => row.visitId).sort(),
  ).toEqual(['outside-order-window', 'recent', 'second']);
  const second = await runStorefrontDataMaintenanceBatch(db, { now, limit: 1 });
  expect(second).toMatchObject({ orderAcquisitionBackfilled: 1, paidClicks: 1 });
  const attribution = await db
    .select()
    .from(orderAcquisitionAttribution)
    .orderBy(asc(orderAcquisitionAttribution.orderId));
  expect(attribution[1]).toMatchObject({
    orderId: savedOrders[1]!.id,
    channel: 'meta_unclassified',
    evidence: 'meta_click_id_only',
    metaCampaignId: null,
    metaAdsetId: null,
    metaAdId: null,
  });
  expect(await backfillOrderAcquisitionAttributionBatch(db)).toBe(0);
  expect(await deleteExpiredPaidClickVisitsBatch(db, { now })).toBe(0);
  expect(
    (await db.select().from(analyticsPaidClickVisits)).map((row) => row.visitId).sort(),
  ).toEqual(['outside-order-window', 'recent']);
  expect(
    await db
      .select()
      .from(analyticsPaidClickDailyRollups)
      .orderBy(asc(analyticsPaidClickDailyRollups.paidSource)),
  ).toEqual([
    expect.objectContaining({
      paidSource: 'fbclid',
      hasOrder: 1,
      visits: 1,
      createdOrder: 1,
      landingPath: '/fr/products',
    }),
    expect.objectContaining({
      paidSource: 'meta_utm',
      hasOrder: 1,
      visits: 2,
      createdOrder: 2,
      landingPath: '/fr/products',
    }),
  ]);
});

it('reconstructs assistant influence from the 24 hours before ordering and keeps captured attribution immutable', async () => {
  const [product] = await db
    .insert(products)
    .values({ title: 'Perceuse', slug: 'perceuse', price: '1000' })
    .returning();
  const journeys = ['ordered', 'clicked', 'engaged', 'outside'];
  await db.insert(analyticsJourneys).values(journeys.map((id) => ({ id })));
  const savedOrders = await db
    .insert(orders)
    .values(
      journeys.map((journeyId) => ({
        phoneNumber1: '0550000000',
        journeyId,
        sessionId: `${journeyId}-order`,
        createdAt: now,
      })),
    )
    .returning();
  await db.insert(orderLineItems).values({
    orderId: savedOrders[0]!.id,
    productId: product!.id,
    contentId: String(product!.id),
    rawValue: String(product!.id),
    titleSnapshot: 'Perceuse',
    originalUnitPrice: '1000',
    effectiveUnitPrice: '1000',
    quantity: 1,
    lineTotal: '1000',
  });
  await db.insert(analyticsEvents).values(
    [
      {
        journeyId: 'ordered',
        sessionId: 'ordered-order',
        eventName: 'ai_assistant_open',
        occurredAt: ago(1),
      },
      {
        journeyId: 'ordered',
        sessionId: 'ordered-order',
        eventName: 'ai_assistant_result_click',
        occurredAt: ago(0.5),
        productId: product!.id,
      },
      {
        journeyId: 'clicked',
        sessionId: 'clicked-previous',
        eventName: 'ai_assistant_result_click',
        occurredAt: ago(0.5),
        productId: product!.id,
      },
      {
        journeyId: 'engaged',
        sessionId: 'engaged-order',
        eventName: 'ai_assistant_message',
        occurredAt: ago(0.5),
      },
      {
        journeyId: 'outside',
        sessionId: 'outside-order',
        eventName: 'ai_assistant_result_click',
        occurredAt: new Date(ago(1).getTime() - 1),
        productId: product!.id,
      },
      {
        journeyId: 'outside',
        sessionId: 'outside-order',
        eventName: 'ai_assistant_result_click',
        occurredAt: new Date(now.getTime() + 1),
        productId: product!.id,
      },
    ].map((event, index) => ({ ...event, eventId: `assistant-${index}` })),
  );

  expect(await backfillOrderAiInfluenceBatch(db, { limit: 1 })).toBe(1);
  expect(await backfillOrderAiInfluenceBatch(db)).toBe(2);
  const captured = await db.select().from(orderAiInfluence).orderBy(asc(orderAiInfluence.orderId));
  expect(captured).toEqual([
    expect.objectContaining({
      orderId: savedOrders[0]!.id,
      level: 'recommended_product_ordered',
      sameSession: true,
      openedAt: ago(1),
      clickedProductIds: [product!.id],
    }),
    expect.objectContaining({
      orderId: savedOrders[1]!.id,
      level: 'recommendation_clicked',
      sameSession: false,
      recommendedProductOrdered: false,
    }),
    expect.objectContaining({
      orderId: savedOrders[2]!.id,
      level: 'engaged',
      clickedProductIds: [],
    }),
  ]);
  await db.insert(analyticsEvents).values({
    eventId: 'later-evidence',
    journeyId: 'engaged',
    sessionId: 'engaged-order',
    eventName: 'ai_assistant_result_click',
    occurredAt: now,
    productId: product!.id,
  });
  expect(await backfillOrderAiInfluenceBatch(db)).toBe(0);
  expect(await db.select().from(orderAiInfluence).orderBy(asc(orderAiInfluence.orderId))).toEqual(
    captured,
  );
});

it('merges query-bearing paid-click rollups without double-counting and stops after 31 days', async () => {
  const days = Array.from({ length: 32 }, (_, index) =>
    new Date(Date.UTC(2026, 6, index + 1)).toISOString().slice(0, 10),
  );
  await db.insert(analyticsPaidClickDailyRollups).values(
    days.flatMap((day) => [
      {
        day,
        variant: 'storefront',
        paidSource: 'meta_utm',
        landingPath: '/fr/products',
        visits: 1,
        landedOnly: 1,
      },
      {
        day,
        variant: 'storefront',
        paidSource: 'meta_utm',
        landingPath: '/fr/products?a=1',
        visits: 3,
        viewedProduct: 1,
        addedToCart: 1,
        beganCheckout: 1,
      },
      {
        day,
        variant: 'storefront',
        paidSource: 'meta_utm',
        landingPath: '/fr/products?a=2',
        visits: 2,
        createdOrder: 1,
        purchased: 1,
        errored: 1,
      },
    ]),
  );
  expect((await normalizeNextPaidClickRollupDays(db)).sort()).toEqual(days.slice(0, 31));
  const normalized = await db
    .select()
    .from(analyticsPaidClickDailyRollups)
    .where(eq(analyticsPaidClickDailyRollups.day, days[0]!));
  expect(normalized).toEqual([
    expect.objectContaining({
      landingPath: '/fr/products',
      visits: 6,
      landedOnly: 1,
      viewedProduct: 1,
      addedToCart: 1,
      beganCheckout: 1,
      createdOrder: 1,
      purchased: 1,
      errored: 1,
    }),
  ]);
  expect(
    await db
      .select()
      .from(analyticsPaidClickDailyRollups)
      .where(eq(analyticsPaidClickDailyRollups.day, days[31]!)),
  ).toHaveLength(3);
  expect(await normalizeNextPaidClickRollupDays(db)).toEqual([days[31]]);
  expect(await normalizeNextPaidClickRollupDays(db)).toEqual([]);
  expect(await db.select().from(analyticsPaidClickDailyRollups)).toHaveLength(32);
  expect(
    await db
      .select()
      .from(analyticsPaidClickDailyRollups)
      .where(eq(analyticsPaidClickDailyRollups.day, days[0]!)),
  ).toEqual(normalized);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
