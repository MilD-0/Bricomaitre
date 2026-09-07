import { randomUUID } from 'node:crypto';
import { createDb } from '@bric/db/client';
import {
  analyticsAcquisitionDailyRollups,
  analyticsAiDailyRollups,
  analyticsDailyRollups,
  analyticsDistinctDailyMembers,
  analyticsEvents,
  analyticsJourneys,
  analyticsPaidClickDailyRollups,
  analyticsPaidClickVisits,
  marketingEventOutbox,
  metaEventOutbox,
  orderMarketingAttribution,
  orderMetaAttribution,
  orderStatusHistory,
  orderAcquisitionAttribution,
  orderAiInfluence,
  orderLineItems,
  orders,
  products,
} from '@bric/db/schema';
import {
  backfillOrderAcquisitionAttributionBatch,
  backfillOrderAiInfluenceBatch,
  compactRetainedAnalyticsErrorsBatch,
  compactRetainedAnalyticsJourneysBatch,
  deleteExpiredAnalyticsEventsBatch,
  deleteExpiredPaidClickVisitsBatch,
  deleteTerminalMarketingOutboxBatch,
  deleteTerminalMetaOutboxBatch,
  rollUpNextExpiredMetaOutboxDay,
  normalizeNextPaidClickRollupDays,
  rollUpNextExpiredAnalyticsDay,
  runStorefrontDataMaintenanceBatch,
} from '@bric/storefront-core/maintenance';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import {
  ensureMarketingOrderStatusEvents,
  processMarketingOutboxBatch,
  reconcileMarketingOrderEvents,
} from '@bric/storefront-core/marketing';
import {
  ensureOrderConfirmedEventForOrder,
  ensureOrderCompletedEventForOrder,
  processMetaOutboxBatch,
  reconcileOrderConfirmedEvents,
  reconcileOrderCompletedEvents,
} from '@bric/storefront-core/meta';
import { MARKETING_SEMANTICS_VERSION } from '@bric/storefront-core/marketing-contracts';
import { META_SEMANTICS_VERSION } from '@bric/storefront-core/meta-contracts';
import { loadShopping } from '../lib/ai-stats-shopping';
import { asc, eq, sql } from 'drizzle-orm';
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

it('rolls back deleted paid-click rows if their merged replacement cannot be persisted', async () => {
  await db.insert(analyticsPaidClickDailyRollups).values([
    {
      day: '2026-07-01',
      variant: 'storefront',
      paidSource: 'meta_utm',
      landingPath: '/fr/products',
      visits: 1,
    },
    {
      day: '2026-07-01',
      variant: 'storefront',
      paidSource: 'meta_utm',
      landingPath: '/fr/products?a=1',
      visits: 2,
    },
  ]);
  const before = await db
    .select()
    .from(analyticsPaidClickDailyRollups)
    .orderBy(asc(analyticsPaidClickDailyRollups.id));
  await db.execute(
    sql`alter table ${analyticsPaidClickDailyRollups} add constraint fixture_reject_merged check (visits < 3)`,
  );
  try {
    await expect(normalizeNextPaidClickRollupDays(db)).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'fixture_reject_merged' },
    });
    expect(
      await db
        .select()
        .from(analyticsPaidClickDailyRollups)
        .orderBy(asc(analyticsPaidClickDailyRollups.id)),
    ).toEqual(before);
  } finally {
    await db.execute(
      sql`alter table ${analyticsPaidClickDailyRollups} drop constraint fixture_reject_merged`,
    );
  }
});

it('keeps raw analytics deletion-ineligible when a later rollup dimension fails', async () => {
  await db.insert(analyticsJourneys).values({ id: 'rollback' });
  await db.insert(analyticsEvents).values(
    [
      { eventId: 'view', eventName: 'page_view' },
      { eventId: 'message', eventName: 'ai_assistant_message' },
    ].map((event) => ({
      ...event,
      journeyId: 'rollback',
      sessionId: 'rollback-session',
      occurredAt: ago(8),
    })),
  );
  await db.execute(
    sql`alter table ${analyticsAiDailyRollups} add constraint fixture_reject_messages check (messages = 0)`,
  );
  try {
    await expect(rollUpNextExpiredAnalyticsDay(db, { now })).rejects.toMatchObject({
      cause: { code: '23514', constraint: 'fixture_reject_messages' },
    });
    expect(await db.select().from(analyticsDailyRollups)).toEqual([]);
    expect(await db.select().from(analyticsDistinctDailyMembers)).toEqual([]);
    expect(await db.select().from(analyticsAcquisitionDailyRollups)).toEqual([]);
    expect(await deleteExpiredAnalyticsEventsBatch(db, { now })).toBe(0);
    expect(await db.select().from(analyticsEvents)).toHaveLength(2);
  } finally {
    await db.execute(
      sql`alter table ${analyticsAiDailyRollups} drop constraint fixture_reject_messages`,
    );
  }
  expect(await rollUpNextExpiredAnalyticsDay(db, { now })).toBe('2026-08-24');
  expect(await deleteExpiredAnalyticsEventsBatch(db, { now })).toBe(1);
  expect((await db.select().from(analyticsEvents)).map((row) => row.eventId)).toEqual(['message']);
});

it('retains compact error identities for 30 days while deleting ordinary detail after seven', async () => {
  await db.insert(analyticsJourneys).values({
    id: 'errors',
    firstSeenAt: ago(8),
    lastSeenAt: ago(8),
    firstPath: '/fr/products',
    lastPath: '/fr/checkout',
    referrer: 'https://example.invalid/private',
    orderCount: 2,
  });
  await db.insert(analyticsEvents).values(
    [
      { eventId: 'expired-error', eventName: 'api_error', occurredAt: ago(31) },
      { eventId: 'boundary-error', eventName: 'api_error', occurredAt: ago(30) },
      { eventId: 'retained-error', eventName: 'api_error', occurredAt: ago(8) },
      { eventId: 'expired-view', eventName: 'page_view', occurredAt: ago(8) },
      { eventId: 'boundary-view', eventName: 'page_view', occurredAt: ago(7) },
    ].map((event) => ({
      ...event,
      journeyId: 'errors',
      sessionId: 'error-session',
      referrer: 'https://example.invalid/private',
      metadata: { status: 503, code: 'upstream', privateExtra: 'discard' },
    })),
  );
  await db.insert(analyticsDailyRollups).values(
    [31, 30, 8, 7].map((days) => ({
      day: ago(days).toISOString().slice(0, 10),
      dimension: 'overall',
    })),
  );
  expect(await deleteExpiredAnalyticsEventsBatch(db, { now, limit: 1 })).toBe(1);
  expect(await deleteExpiredAnalyticsEventsBatch(db, { now })).toBe(1);
  expect((await db.select().from(analyticsEvents)).map((row) => row.eventId).sort()).toEqual([
    'boundary-error',
    'boundary-view',
    'retained-error',
  ]);
  expect(await compactRetainedAnalyticsErrorsBatch(db, { now })).toBe(2);
  const [error] = await db
    .select()
    .from(analyticsEvents)
    .where(eq(analyticsEvents.eventId, 'retained-error'));
  expect(error!.referrer).toBeNull();
  expect(error!.metadata).toEqual({ retainedError: true, status: 503, code: 'upstream' });
  expect(await compactRetainedAnalyticsJourneysBatch(db, { now })).toBe(0);
  // Once only retained errors remain, scrub context but preserve the referenced identity.
  expect(await deleteExpiredAnalyticsEventsBatch(db, { now: new Date(now.getTime() + 1) })).toBe(2);
  expect(await compactRetainedAnalyticsJourneysBatch(db, { now })).toBe(1);
  expect(await db.select().from(analyticsJourneys)).toEqual([
    expect.objectContaining({
      id: 'errors',
      firstPath: null,
      lastPath: null,
      referrer: null,
      orderCount: 0,
    }),
  ]);
  expect(await compactRetainedAnalyticsJourneysBatch(db, { now })).toBe(0);
});

it('deletes only terminal marketing deliveries beyond their seven or 30 day retention window', async () => {
  const cases = [
    ['accepted-expired', 'accepted', 8],
    ['accepted-boundary', 'accepted', 7],
    ['rejected-expired', 'rejected', 31],
    ['exhausted-expired', 'exhausted', 31],
    ['dropped-expired', 'dropped', 31],
    ['rejected-boundary', 'rejected', 30],
    ['queued', 'queued', 60],
    ['retrying', 'retrying', 60],
    ['processing', 'processing', 60],
  ] as const;
  await db.insert(marketingEventOutbox).values(
    cases.map(([eventId, status, days]) => ({
      destination: 'tiktok',
      eventName: 'Purchase',
      eventId,
      status,
      source: 'order_create',
      eventTime: ago(60),
      createdAt: ago(60),
      updatedAt: ago(days),
      deliveredAt: status === 'accepted' ? ago(days) : null,
    })),
  );
  expect(await deleteTerminalMarketingOutboxBatch(db, { now, limit: 1 })).toBe(1);
  expect(await deleteTerminalMarketingOutboxBatch(db, { now })).toBe(3);
  expect(await deleteTerminalMarketingOutboxBatch(db, { now })).toBe(0);
  expect((await db.select().from(marketingEventOutbox)).map((row) => row.eventId).sort()).toEqual([
    'accepted-boundary',
    'processing',
    'queued',
    'rejected-boundary',
    'retrying',
  ]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it('preserves intent clicks in the real shopping report after retention rollup', async () => {
  const occurredAt = ago(8);
  const day = occurredAt.toISOString().slice(0, 10);
  await db.insert(analyticsJourneys).values({ id: 'intent-clicks' });
  await db.insert(analyticsEvents).values(
    ['ai_assistant_message', 'ai_assistant_result_click'].map((eventName) => ({
      eventId: randomUUID(),
      journeyId: 'intent-clicks',
      sessionId: 'intent-session',
      eventName,
      occurredAt,
      metadata: { storefrontProject: STOREFRONT_ANALYTICS_PROJECT, intent: 'product_discovery' },
    })),
  );
  const filters = {
    surface: 'shopping' as const,
    range: 'custom' as const,
    startDate: day,
    endDate: day,
    grain: 'day' as const,
    resolvedGrain: 'day' as const,
  };
  const before = await loadShopping(db, filters);
  expect(before.intents).toEqual([
    expect.objectContaining({ name: 'product_discovery', resultClicks: 1 }),
  ]);
  expect(await rollUpNextExpiredAnalyticsDay(db, { now })).toBe(day);
  await deleteExpiredAnalyticsEventsBatch(db, { now });
  expect(await db.select().from(analyticsEvents)).toHaveLength(2);
  const after = await loadShopping(db, filters);
  expect(after.intents).toEqual(before.intents);
  expect(after.metrics).toEqual(before.metrics);
});

it.each([ORDER_STATUS.CONFIRMED, ORDER_STATUS.COMPLETED])(
  'does not recreate expired status %i events after terminal retention',
  async (status) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ago(40));
    vi.stubEnv('GOOGLE_ANALYTICS_MEASUREMENT_ID', 'test');
    vi.stubEnv('GOOGLE_ANALYTICS_API_SECRET', 'test');
    vi.stubEnv('TIKTOK_PIXEL_ID', 'test');
    vi.stubEnv('TIKTOK_EVENTS_API_ACCESS_TOKEN', 'test');
    const input = await seedAdvertisingStatus(status, new Date());
    const ensureMeta =
      status === ORDER_STATUS.CONFIRMED
        ? ensureOrderConfirmedEventForOrder
        : ensureOrderCompletedEventForOrder;
    const reconcileMeta =
      status === ORDER_STATUS.CONFIRMED
        ? reconcileOrderConfirmedEvents
        : reconcileOrderCompletedEvents;
    expect(await ensureMarketingOrderStatusEvents(db, input)).toMatchObject({ created: true });
    expect(await ensureMeta(db, input)).toMatchObject({ created: true });
    vi.setSystemTime(ago(31));
    await processMarketingOutboxBatch(db);
    await processMetaOutboxBatch(db);
    expect((await db.select().from(marketingEventOutbox)).map((row) => row.status)).toEqual([
      'dropped',
      'dropped',
    ]);
    expect((await db.select().from(metaEventOutbox)).map((row) => row.status)).toEqual(['skipped']);
    vi.setSystemTime(now);
    await rollUpNextExpiredMetaOutboxDay(db, { now });
    expect(await deleteTerminalMarketingOutboxBatch(db, { now })).toBe(2);
    expect(await deleteTerminalMetaOutboxBatch(db, { now })).toBe(1);
    // A later repetition of the same milestone must not renew its delivery window.
    await db.insert(orderStatusHistory).values({ orderId: input.orderId, status, changedAt: now });
    const marketingResult = await reconcileMarketingOrderEvents(db);
    const metaResult = await reconcileMeta(db);
    expect.soft(marketingResult).toMatchObject({ marketingScanned: 0, marketingCreated: 0 });
    expect.soft(Object.values(metaResult)).toEqual([0, 0]);
    expect(await ensureMarketingOrderStatusEvents(db, input)).toMatchObject({ created: false });
    expect(await ensureMeta(db, input)).toMatchObject({ created: false });
    expect(await db.select().from(marketingEventOutbox)).toHaveLength(0);
    expect(await db.select().from(metaEventOutbox)).toHaveLength(0);
  },
);

async function seedAdvertisingStatus(status: number, changedAt: Date) {
  const [order] = await db.insert(orders).values({ phoneNumber1: '0550000000' }).returning();
  const [product] = await db
    .insert(products)
    .values({ title: 'Retention', slug: randomUUID(), price: '1000' })
    .returning();
  await db.insert(orderLineItems).values({
    orderId: order!.id,
    productId: product!.id,
    contentId: String(product!.id),
    rawValue: String(product!.id),
    titleSnapshot: 'Retention',
    originalUnitPrice: '1000',
    effectiveUnitPrice: '1000',
    quantity: 1,
    lineTotal: '1000',
  });
  const [history] = await db
    .insert(orderStatusHistory)
    .values({ orderId: order!.id, status, changedAt })
    .returning();
  await db.insert(orderMarketingAttribution).values({
    orderId: order!.id,
    semanticsVersion: MARKETING_SEMANTICS_VERSION,
    eventId: randomUUID(),
    eventSourceUrl: 'https://example.invalid',
    expiresAt: ago(-60),
  });
  await db.insert(orderMetaAttribution).values({
    orderId: order!.id,
    semanticsVersion: META_SEMANTICS_VERSION,
    leadEventId: randomUUID(),
    eventSourceUrl: 'https://example.invalid',
    expiresAt: ago(-60),
  });
  return {
    orderId: order!.id,
    statusHistoryId: history!.id,
    status,
    changedAt,
  };
}

it('reconciles recent work per destination without renewing an expired Google window', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  vi.stubEnv('GOOGLE_ANALYTICS_MEASUREMENT_ID', 'test');
  vi.stubEnv('GOOGLE_ANALYTICS_API_SECRET', 'test');
  vi.stubEnv('TIKTOK_PIXEL_ID', 'test');
  vi.stubEnv('TIKTOK_EVENTS_API_ACCESS_TOKEN', 'test');
  const recent = await seedAdvertisingStatus(ORDER_STATUS.CONFIRMED, ago(1));
  const older = await seedAdvertisingStatus(ORDER_STATUS.CONFIRMED, ago(4));
  expect(await reconcileMarketingOrderEvents(db)).toEqual({
    marketingScanned: 2,
    marketingCreated: 2,
  });
  const rows = await db.select().from(marketingEventOutbox);
  expect(
    rows
      .filter((row) => row.orderId === recent.orderId)
      .map((row) => row.destination)
      .sort(),
  ).toEqual(['google', 'tiktok']);
  expect(rows.filter((row) => row.orderId === older.orderId).map((row) => row.destination)).toEqual(
    ['tiktok'],
  );
  expect(await reconcileMarketingOrderEvents(db)).toEqual({
    marketingScanned: 0,
    marketingCreated: 0,
  });
  expect(await reconcileOrderConfirmedEvents(db)).toEqual({
    confirmationScanned: 2,
    confirmationCreated: 2,
  });
  expect(await reconcileOrderConfirmedEvents(db)).toEqual({
    confirmationScanned: 0,
    confirmationCreated: 0,
  });
});
