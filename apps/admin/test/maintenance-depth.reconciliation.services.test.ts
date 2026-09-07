import { createDb } from '@bric/db/client';
import {
  marketingEventOutbox,
  orderLineItems,
  orderMarketingAttribution,
  orderMetaAttribution,
  orders,
  orderStatusHistory,
  products,
} from '@bric/db/schema';
import { reconcileMarketingOrderEvents } from '@bric/storefront-core/marketing';
import { MARKETING_SEMANTICS_VERSION } from '@bric/storefront-core/marketing-contracts';
import { reconcileOrderConfirmedEvents } from '@bric/storefront-core/meta';
import { META_SEMANTICS_VERSION } from '@bric/storefront-core/meta-contracts';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { sql } from 'drizzle-orm';
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

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
