import { desc, sql } from 'drizzle-orm';

import { getDb } from '../db/client';
import { marketingEventOutbox } from '../db/schema';

export async function getMarketingDestinationDiagnostics() {
  const db = getDb();
  const [destinations, recentFailures] = await Promise.all([
    db.select({
      destination: marketingEventOutbox.destination,
      queued: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'queued')::int`,
      processing: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'processing')::int`,
      accepted: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'accepted')::int`,
      duplicated: sql<number>`coalesce(sum(${marketingEventOutbox.duplicateCount}), 0)::int`,
      rejected: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'rejected')::int`,
      retrying: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'retrying')::int`,
      exhausted: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'exhausted')::int`,
      dropped: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'dropped')::int`,
      oldestPendingAt: sql<Date | null>`min(${marketingEventOutbox.createdAt}) filter (where ${marketingEventOutbox.status} in ('queued', 'processing', 'retrying'))`,
      lastAcceptedAt: sql<Date | null>`max(${marketingEventOutbox.deliveredAt})`,
    }).from(marketingEventOutbox)
      .groupBy(marketingEventOutbox.destination)
      .orderBy(marketingEventOutbox.destination),
    db.select({
      destination: marketingEventOutbox.destination,
      eventName: marketingEventOutbox.eventName,
      eventId: marketingEventOutbox.eventId,
      orderId: marketingEventOutbox.orderId,
      status: marketingEventOutbox.status,
      attemptCount: marketingEventOutbox.attemptCount,
      lastHttpStatus: marketingEventOutbox.lastHttpStatus,
      errorCode: marketingEventOutbox.errorCode,
      errorMessage: marketingEventOutbox.errorMessage,
      lastAttemptAt: marketingEventOutbox.lastAttemptAt,
    }).from(marketingEventOutbox)
      .where(sql`${marketingEventOutbox.status} in ('retrying', 'rejected', 'exhausted', 'dropped')`)
      .orderBy(desc(marketingEventOutbox.lastAttemptAt))
      .limit(25),
  ]);
  return { destinations, recentFailures };
}
