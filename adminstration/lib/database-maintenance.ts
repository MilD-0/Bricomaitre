import { runStorefrontDataMaintenanceBatch, STOREFRONT_MAINTENANCE_BATCH_SIZE } from '@bric/storefront-core/maintenance';
import { sql } from 'drizzle-orm';

import { getDb } from '../db/client';
import { actionLogs } from '../db/schema';

export const ACTION_LOG_RETENTION_DAYS = 7;
export const DATABASE_MAINTENANCE_MAX_BATCHES = 25;

function daysBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function getActionLogCutoff(now: Date) {
  return daysBefore(now, ACTION_LOG_RETENTION_DAYS);
}

export async function deleteExpiredActionLogsBatch({
  now = new Date(),
  limit = STOREFRONT_MAINTENANCE_BATCH_SIZE,
}: { now?: Date; limit?: number } = {}) {
  const db = getDb();
  const cutoff = getActionLogCutoff(now);
  const result = await db.execute(sql`
    with expired as (
      select ${actionLogs.id}
      from ${actionLogs}
      where ${actionLogs.createdAt} < ${cutoff}
      order by ${actionLogs.createdAt} asc, ${actionLogs.id} asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${actionLogs} logs
    using expired
    where logs.id = expired.id
    returning logs.id
  `);
  return result.rows.length;
}

export async function runDatabaseMaintenance({
  now = new Date(),
  limit = STOREFRONT_MAINTENANCE_BATCH_SIZE,
  maxBatches = DATABASE_MAINTENANCE_MAX_BATCHES,
}: { now?: Date; limit?: number; maxBatches?: number } = {}) {
  const db = getDb();
  const totals = {
    actionLogs: 0,
    paidClicks: 0,
    paidClickDaysRolledUp: 0,
    metaOutbox: 0,
    metaErrorsCompacted: 0,
    analyticsEvents: 0,
    analyticsErrorsCompacted: 0,
    analyticsJourneysCompacted: 0,
    analyticsJourneys: 0,
    analyticsDaysRolledUp: 0,
    metaDaysRolledUp: 0,
  };

  for (let batch = 0; batch < Math.max(1, maxBatches); batch += 1) {
    const actionLogCount = await deleteExpiredActionLogsBatch({ now, limit });
    const storefront = await runStorefrontDataMaintenanceBatch(db, { now, limit });

    totals.actionLogs += actionLogCount;
    totals.paidClicks += storefront.paidClicks;
    totals.paidClickDaysRolledUp += storefront.paidClickRolledUpDay ? 1 : 0;
    totals.metaOutbox += storefront.metaOutbox;
    totals.metaErrorsCompacted += storefront.metaErrorsCompacted;
    totals.metaDaysRolledUp += storefront.metaRolledUpDay ? 1 : 0;
    totals.analyticsEvents += storefront.analyticsEvents;
    totals.analyticsErrorsCompacted += storefront.analyticsErrorsCompacted;
    totals.analyticsJourneysCompacted += storefront.analyticsJourneysCompacted;
    totals.analyticsJourneys += storefront.analyticsJourneys;
    totals.analyticsDaysRolledUp += storefront.rolledUpDay ? 1 : 0;

    if (actionLogCount < limit
      && storefront.paidClicks < limit
      && storefront.metaErrorsCompacted < limit
      && storefront.metaOutbox < limit
      && storefront.analyticsEvents < limit
      && storefront.analyticsErrorsCompacted < limit
      && storefront.analyticsJourneysCompacted < limit
      && storefront.analyticsJourneys < limit
      && storefront.rolledUpDay === null
      && storefront.paidClickRolledUpDay === null
      && storefront.metaRolledUpDay === null) {
      break;
    }
  }

  return totals;
}
