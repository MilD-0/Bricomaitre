import { storefrontOrderIdempotency } from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import {
  backfillOrderAcquisitionAttributionBatch,
  backfillOrderAiInfluenceBatch,
  deleteExpiredPaidClickVisitsBatch,
  normalizeNextPaidClickRollupDays,
  rollUpNextExpiredPaidClickDay,
} from './acquisition';
import {
  compactRetainedAnalyticsErrorsBatch,
  compactRetainedAnalyticsJourneysBatch,
  deleteExpiredAnalyticsEventsBatch,
  deleteExpiredAnalyticsSessionsBatch,
  deleteInactiveAnalyticsJourneysBatch,
  deleteUnusedAnalyticsMembersBatch,
} from './analytics-retention';
import { rollUpNextExpiredAnalyticsDay } from './analytics-rollups';
import {
  compactRetainedMetaErrorsBatch,
  deleteTerminalMarketingOutboxBatch,
  deleteTerminalMetaOutboxBatch,
  rollUpNextExpiredMetaOutboxDay,
} from './outbox';
import { type Database, STOREFRONT_MAINTENANCE_BATCH_SIZE, deletedCount } from './policy';

export async function deleteExpiredOrderIdempotencyBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  // A browser can retry a saved request days later. Completed keys live with their orders.
  const result = await db.execute(sql`
    with expired as (
      select ${storefrontOrderIdempotency.keyHash}
      from ${storefrontOrderIdempotency}
      where ${storefrontOrderIdempotency.expiresAt} < ${now}
        and ${storefrontOrderIdempotency.orderId} is null
      order by ${storefrontOrderIdempotency.expiresAt} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${storefrontOrderIdempotency} records
    using expired
    where records.key_hash = expired.key_hash
    returning records.key_hash
  `);
  return deletedCount(result);
}

export async function runStorefrontDataMaintenanceBatch(
  db: Database,
  options: { now?: Date; limit?: number } = {},
) {
  const unusedAnalyticsMembers = await deleteUnusedAnalyticsMembersBatch(db, options);
  const orderIdempotency = await deleteExpiredOrderIdempotencyBatch(db, options);
  const orderAcquisitionBackfilled = await backfillOrderAcquisitionAttributionBatch(db, options);
  const orderAiInfluenceBackfilled = await backfillOrderAiInfluenceBatch(db, options);
  const paidClickNormalizedDays = await normalizeNextPaidClickRollupDays(db);
  const paidClickRolledUpDay = await rollUpNextExpiredPaidClickDay(db, options);
  const paidClicks = await deleteExpiredPaidClickVisitsBatch(db, options);
  const metaRolledUpDay = await rollUpNextExpiredMetaOutboxDay(db, options);
  const metaErrorsCompacted = await compactRetainedMetaErrorsBatch(db, options);
  const metaOutbox = await deleteTerminalMetaOutboxBatch(db, options);
  const marketingOutbox = await deleteTerminalMarketingOutboxBatch(db, options);
  const rolledUpDay = await rollUpNextExpiredAnalyticsDay(db, options);
  const analyticsErrorsCompacted = await compactRetainedAnalyticsErrorsBatch(db, options);
  const analyticsEventsDeleted = await deleteExpiredAnalyticsEventsBatch(db, options);
  const analyticsSessionsDeleted = await deleteExpiredAnalyticsSessionsBatch(db, options);
  const analyticsJourneysCompacted = await compactRetainedAnalyticsJourneysBatch(db, options);
  const analyticsJourneysDeleted = await deleteInactiveAnalyticsJourneysBatch(db, options);

  return {
    unusedAnalyticsMembers,
    orderIdempotency,
    orderAcquisitionBackfilled,
    orderAiInfluenceBackfilled,
    paidClickNormalizedDays,
    paidClicks,
    paidClickRolledUpDay,
    metaRolledUpDay,
    metaErrorsCompacted,
    metaOutbox,
    marketingOutbox,
    rolledUpDay,
    analyticsErrorsCompacted,
    analyticsEvents: analyticsEventsDeleted,
    analyticsSessions: analyticsSessionsDeleted,
    analyticsJourneysCompacted,
    analyticsJourneys: analyticsJourneysDeleted,
  };
}
