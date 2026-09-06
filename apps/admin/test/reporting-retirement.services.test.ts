import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import {
  analyticsPaidClickDailyRollups,
  metaEventDailyRollups,
  metaEventOutbox,
} from '@bric/db/schema';
import { loadAcquisitionDiagnostics } from '../lib/analytics/acquisition-diagnostics';

afterAll(async () => {
  await getPool().end();
});
it('preserves acquisition diagnostics across rolled historical days and the live event tail', async () => {
  const db = getDb(),
    eventName = `test-${randomUUID()}`;
  const day = '2098-06-01',
    nextDay = '2098-06-02';
  const ids = [randomUUID(), randomUUID()];
  await db.insert(metaEventDailyRollups).values({
    day,
    eventName,
    total: 5,
    delivered: 4,
    failed: 1,
    lastOccurredAt: new Date(`${day}T12:00:00Z`),
  });
  await db.insert(metaEventOutbox).values(
    ids.map((eventId, i) => ({
      eventId,
      eventName,
      source: 'test',
      eventTime: new Date(`${i ? nextDay : day}T12:00:00Z`),
      eventSourceUrl: 'https://example.com/',
      status: 'delivered',
      attemptCount: 1,
    })),
  );
  const [paid] = await db
    .insert(analyticsPaidClickDailyRollups)
    .values({
      day,
      variant: 'storefront',
      paidSource: eventName,
      landingPath: '/',
      createdOrder: 2,
      purchased: 1,
    })
    .returning();
  try {
    const result = await loadAcquisitionDiagnostics(db, {
      range: 'custom',
      startDate: day,
      endDate: nextDay,
    });
    expect(result).toMatchObject({ available: true, createdOrders: 3 });
    expect(result.events.find((row) => row.name === eventName)).toMatchObject({
      total: 6,
      capiDelivered: 5,
      capiFailed: 1,
      lastOccurredAt: `${nextDay}T12:00:00.000Z`,
    });
  } finally {
    await db.delete(metaEventOutbox).where(inArray(metaEventOutbox.eventId, ids));
    await db
      .delete(metaEventDailyRollups)
      .where(
        and(eq(metaEventDailyRollups.day, day), eq(metaEventDailyRollups.eventName, eventName)),
      );
    await db
      .delete(analyticsPaidClickDailyRollups)
      .where(eq(analyticsPaidClickDailyRollups.id, paid!.id));
  }
});
