import {
  PAID_CLICK_ROLLUP_NORMALIZATION_BATCH_DAYS,
  runStorefrontDataMaintenanceBatch,
  STOREFRONT_MAINTENANCE_BATCH_SIZE,
} from '@bric/storefront-core/maintenance';
import { sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { actionLogs, adminReportingSnapshotRuns, adminReportingSnapshots } from '@bric/db/schema';
import { deleteExpiredPrivateS3Objects } from './s3-upload';

export const ACTION_LOG_RETENTION_DAYS = 7;
export const REPORTING_SNAPSHOT_RETENTION_DAYS = 7;
export const REPORTING_RUN_RETENTION_DAYS = 30;
export const ORDER_EXPORT_ARTIFACT_RETENTION_HOURS = 24;
const DATABASE_MAINTENANCE_MAX_BATCHES = 25;

type Database = ReturnType<typeof getDb>;

function daysBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function getActionLogCutoff(now: Date) {
  return daysBefore(now, ACTION_LOG_RETENTION_DAYS);
}

export function getReportingSnapshotCutoff(now: Date) {
  return daysBefore(now, REPORTING_SNAPSHOT_RETENTION_DAYS);
}

export function getReportingRunCutoff(now: Date) {
  return daysBefore(now, REPORTING_RUN_RETENTION_DAYS);
}

export function getOrderExportArtifactCutoff(now: Date) {
  return new Date(now.getTime() - ORDER_EXPORT_ARTIFACT_RETENTION_HOURS * 60 * 60 * 1_000);
}

function deleteExpiredOrderExportArtifacts(now = new Date()) {
  return deleteExpiredPrivateS3Objects({
    prefix: 'exports/orders/',
    cutoff: getOrderExportArtifactCutoff(now),
  });
}

export async function deleteExpiredReportingSnapshotsBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const cutoff = getReportingSnapshotCutoff(now);
  const result = await db.execute(sql`
    with expired as (
      select stale.id
      from ${adminReportingSnapshots} stale
      where stale.created_at < ${cutoff}
        and exists (
          select 1
          from ${adminReportingSnapshots} newer
          where newer.snapshot_key = stale.snapshot_key
            and (newer.generated_at, newer.id) > (stale.generated_at, stale.id)
        )
      order by stale.created_at asc, stale.id asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${adminReportingSnapshots} snapshots
    using expired
    where snapshots.id = expired.id
    returning snapshots.id
  `);
  return result.rows.length;
}

export async function deleteExpiredReportingRunsBatch(
  db: Database,
  { now = new Date(), limit = STOREFRONT_MAINTENANCE_BATCH_SIZE } = {},
) {
  const cutoff = getReportingRunCutoff(now);
  const result = await db.execute(sql`
    with expired as (
      select runs.id
      from ${adminReportingSnapshotRuns} runs
      where runs.created_at < ${cutoff}
        and runs.status <> 'running'
        and not exists (
          select 1
          from ${adminReportingSnapshots} snapshots
          where snapshots.run_id = runs.run_id
        )
      order by runs.created_at asc, runs.id asc
      limit ${Math.max(1, limit)}
      for update skip locked
    )
    delete from ${adminReportingSnapshotRuns} runs
    using expired
    where runs.id = expired.id
    returning runs.id
  `);
  return result.rows.length;
}

async function deleteExpiredActionLogsBatch({
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
    reportingSnapshots: 0,
    reportingRuns: 0,
    orderAcquisitionBackfilled: 0,
    orderAiInfluenceBackfilled: 0,
    paidClickNormalizedDays: 0,
    paidClicks: 0,
    paidClickDaysRolledUp: 0,
    metaOutbox: 0,
    marketingOutbox: 0,
    metaErrorsCompacted: 0,
    analyticsEvents: 0,
    analyticsSessions: 0,
    analyticsErrorsCompacted: 0,
    analyticsJourneysCompacted: 0,
    analyticsJourneys: 0,
    analyticsDaysRolledUp: 0,
    metaDaysRolledUp: 0,
    orderIdempotency: 0,
    orderExportArtifacts: 0,
  };

  for (let batch = 0; batch < Math.max(1, maxBatches); batch += 1) {
    const actionLogCount = await deleteExpiredActionLogsBatch({ now, limit });
    const reportingSnapshotCount = await deleteExpiredReportingSnapshotsBatch(db, { now, limit });
    const reportingRunCount = await deleteExpiredReportingRunsBatch(db, { now, limit });
    const storefront = await runStorefrontDataMaintenanceBatch(db, { now, limit });

    totals.actionLogs += actionLogCount;
    totals.reportingSnapshots += reportingSnapshotCount;
    totals.reportingRuns += reportingRunCount;
    totals.orderAcquisitionBackfilled += storefront.orderAcquisitionBackfilled;
    totals.orderAiInfluenceBackfilled += storefront.orderAiInfluenceBackfilled;
    totals.paidClickNormalizedDays += storefront.paidClickNormalizedDays.length;
    totals.paidClicks += storefront.paidClicks;
    totals.paidClickDaysRolledUp += storefront.paidClickRolledUpDay ? 1 : 0;
    totals.metaOutbox += storefront.metaOutbox;
    totals.marketingOutbox += storefront.marketingOutbox;
    totals.metaErrorsCompacted += storefront.metaErrorsCompacted;
    totals.metaDaysRolledUp += storefront.metaRolledUpDay ? 1 : 0;
    totals.orderIdempotency += storefront.orderIdempotency;
    totals.analyticsEvents += storefront.analyticsEvents;
    totals.analyticsSessions += storefront.analyticsSessions;
    totals.analyticsErrorsCompacted += storefront.analyticsErrorsCompacted;
    totals.analyticsJourneysCompacted += storefront.analyticsJourneysCompacted;
    totals.analyticsJourneys += storefront.analyticsJourneys;
    totals.analyticsDaysRolledUp += storefront.rolledUpDay ? 1 : 0;

    if (
      actionLogCount < limit &&
      reportingSnapshotCount < limit &&
      reportingRunCount < limit &&
      storefront.orderAcquisitionBackfilled < limit &&
      storefront.orderAiInfluenceBackfilled < limit &&
      storefront.paidClickNormalizedDays.length < PAID_CLICK_ROLLUP_NORMALIZATION_BATCH_DAYS &&
      storefront.paidClicks < limit &&
      storefront.metaErrorsCompacted < limit &&
      storefront.metaOutbox < limit &&
      storefront.marketingOutbox < limit &&
      storefront.analyticsEvents < limit &&
      storefront.analyticsSessions < limit &&
      storefront.analyticsErrorsCompacted < limit &&
      storefront.analyticsJourneysCompacted < limit &&
      storefront.analyticsJourneys < limit &&
      storefront.rolledUpDay === null &&
      storefront.paidClickRolledUpDay === null &&
      storefront.metaRolledUpDay === null &&
      storefront.orderIdempotency < limit
    ) {
      break;
    }
  }

  totals.orderExportArtifacts = await deleteExpiredOrderExportArtifacts(now);

  return totals;
}
