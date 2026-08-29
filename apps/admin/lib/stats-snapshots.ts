import { desc, eq } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { adminReportingSnapshotRuns, adminReportingSnapshots } from '@bric/db/schema';
import { type StatsDashboardData, type StatsFilters, statsQuerySchema } from './stats-contract';
import { computeStatsDashboard } from './stats-dashboard-compute';
import { normalizeStatsDashboardData } from './stats-dashboard-foundation';
import { withLiveOperationalAnalytics } from './stats-dashboard-live';
import { buildResolvedFilters } from './stats-live-sources';

const ADMIN_REPORTING_STALE_AFTER_MS = 26 * 60 * 60 * 1000;
const ADMIN_REPORTING_STANDARD_INPUTS = [
  { range: '7d' },
  { range: '14d' },
  { range: '30d' },
  { range: '90d' },
  { range: 'year' },
  { range: 'all' },
] satisfies StatsFilters[];

function getSnapshotKey(filters: Required<StatsFilters>) {
  return `storefront-history-v4:${filters.range}:${filters.startDate || '*'}:${filters.endDate || '*'}`;
}

export function getReportThroughDate(data: StatsDashboardData) {
  const candidates = [
    ...data.trends.daily
      .filter((point) => point.revenue !== 0 || point.profit !== 0 || point.fees !== 0)
      .map((point) => point.bucket),
    ...data.trends.imports.map((point) => point.bucket),
  ].filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));

  return candidates.length > 0 ? candidates.sort().at(-1)! : null;
}

const FINANCIAL_COVERAGE_LAG_GRACE_DAYS = 3;

export function isFinancialDataLagging(reportThroughDate: string | null, selectedEndDate: string) {
  if (!selectedEndDate) return false;
  if (!reportThroughDate) return true;

  const reportTime = Date.parse(`${reportThroughDate}T00:00:00Z`);
  const endTime = Date.parse(`${selectedEndDate}T00:00:00Z`);
  return endTime - reportTime > FINANCIAL_COVERAGE_LAG_GRACE_DAYS * 24 * 60 * 60 * 1_000;
}

function withSnapshotMeta(
  data: StatsDashboardData,
  row: typeof adminReportingSnapshots.$inferSelect,
): StatsDashboardData {
  const filters = buildResolvedFilters(
    statsQuerySchema.parse({
      range: row.range as StatsFilters['range'],
      startDate: row.startDate ?? undefined,
      endDate: row.endDate ?? undefined,
    }),
  );
  const normalized = normalizeStatsDashboardData(data, filters);

  return {
    ...normalized,
    snapshot: {
      generatedAt: row.generatedAt.toISOString(),
      staleAt: row.staleAt.toISOString(),
      isStale: row.staleAt.getTime() < Date.now(),
      trigger: row.trigger,
      sourceImportBatchId: row.sourceImportBatchId,
      reportThroughDate: row.reportThroughDate,
      financialDataIsLagging: isFinancialDataLagging(row.reportThroughDate, filters.endDate),
    },
  };
}

function stripSnapshotMeta(data: StatsDashboardData) {
  const { snapshot, ...payload } = data;
  void snapshot;
  return payload;
}

async function readLatestStatsSnapshot(input: StatsFilters) {
  const db = getDb();
  const filters = buildResolvedFilters(statsQuerySchema.parse(input));
  const rows = await db
    .select()
    .from(adminReportingSnapshots)
    .where(eq(adminReportingSnapshots.snapshotKey, getSnapshotKey(filters)))
    .orderBy(desc(adminReportingSnapshots.generatedAt), desc(adminReportingSnapshots.id))
    .limit(1);
  const row = rows[0];

  return row ? withSnapshotMeta(row.payload as StatsDashboardData, row) : null;
}

export async function getStatsDashboard(input: StatsFilters) {
  const snapshot = await readLatestStatsSnapshot(input);
  if (isStatsSnapshotUsable(snapshot)) {
    return withLiveOperationalAnalytics(snapshot, input);
  }

  const data = await computeStatsDashboard(input);
  await writeAdminReportingSnapshot({
    runId: `bootstrap-${crypto.randomUUID()}`,
    trigger: 'bootstrap-request',
    data,
  });
  return withLiveOperationalAnalytics(
    readLatestStatsSnapshot(input).then((latest) => latest ?? data),
    input,
  );
}

export function isStatsSnapshotUsable(
  snapshot: StatsDashboardData | null,
): snapshot is StatsDashboardData {
  return Boolean(snapshot && !snapshot.snapshot?.isStale);
}

export async function refreshStatsDashboard(input: StatsFilters, trigger = 'manual-refresh') {
  const data = await computeStatsDashboard(input);
  await writeAdminReportingSnapshot({
    runId: `${trigger}-${crypto.randomUUID()}`,
    trigger,
    data,
  });

  return withLiveOperationalAnalytics(
    readLatestStatsSnapshot(input).then((latest) => latest ?? data),
    input,
  );
}

async function writeAdminReportingSnapshot({
  runId,
  trigger,
  sourceImportBatchId = null,
  data,
}: {
  runId: string;
  trigger: string;
  sourceImportBatchId?: string | null;
  data: StatsDashboardData;
}) {
  const db = getDb();
  const filters = buildResolvedFilters(data.filters);
  const now = new Date();
  const staleAt = new Date(now.getTime() + ADMIN_REPORTING_STALE_AFTER_MS);
  await db
    .insert(adminReportingSnapshots)
    .values({
      snapshotKey: getSnapshotKey(filters),
      runId,
      trigger,
      sourceImportBatchId,
      range: filters.range,
      startDate: filters.startDate || null,
      endDate: filters.endDate || null,
      reportThroughDate: getReportThroughDate(data),
      payload: stripSnapshotMeta(data),
      generatedAt: now,
      staleAt,
    })
    .onConflictDoUpdate({
      target: [adminReportingSnapshots.snapshotKey, adminReportingSnapshots.runId],
      set: {
        trigger,
        sourceImportBatchId,
        range: filters.range,
        startDate: filters.startDate || null,
        endDate: filters.endDate || null,
        reportThroughDate: getReportThroughDate(data),
        payload: stripSnapshotMeta(data),
        generatedAt: now,
        staleAt,
      },
    });
}

export async function refreshAdminReportingSnapshots({
  runId = crypto.randomUUID(),
  trigger,
  sourceImportBatchId = null,
}: {
  runId?: string;
  trigger: string;
  sourceImportBatchId?: string | null;
}) {
  const db = getDb();
  const startedAt = new Date();

  await db
    .insert(adminReportingSnapshotRuns)
    .values({
      runId,
      trigger,
      sourceImportBatchId,
      status: 'running',
      startedAt,
      updatedAt: startedAt,
    })
    .onConflictDoUpdate({
      target: adminReportingSnapshotRuns.runId,
      set: {
        trigger,
        sourceImportBatchId,
        status: 'running',
        startedAt,
        updatedAt: startedAt,
        errorMessage: null,
      },
    });

  try {
    let built = 0;
    for (const input of ADMIN_REPORTING_STANDARD_INPUTS) {
      const data = await computeStatsDashboard(input);
      await writeAdminReportingSnapshot({
        runId,
        trigger,
        sourceImportBatchId,
        data,
      });
      built += 1;
    }

    const completedAt = new Date();
    await db
      .update(adminReportingSnapshotRuns)
      .set({
        status: 'completed',
        completedAt,
        updatedAt: completedAt,
        errorMessage: null,
      })
      .where(eq(adminReportingSnapshotRuns.runId, runId));

    return {
      runId,
      trigger,
      sourceImportBatchId,
      snapshots: built,
    };
  } catch (error) {
    const failedAt = new Date();
    await db
      .update(adminReportingSnapshotRuns)
      .set({
        status: 'failed',
        completedAt: failedAt,
        updatedAt: failedAt,
        errorMessage: error instanceof Error ? error.message : 'Unknown reporting refresh failure',
      })
      .where(eq(adminReportingSnapshotRuns.runId, runId));
    throw error;
  }
}
