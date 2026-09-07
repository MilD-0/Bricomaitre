import { getRedis } from '@bric/runtime/redis';
import { refreshAnalyticsFacts } from '../analytics-facts';
import {
  type AdCostsImportPayload,
  type ReportingRefreshPayload,
  type StatsImportPayload,
} from '../background-job-contract';
import { getReportingDb } from '../reporting-db';
import { importAdCostsSpreadsheet } from '../stats-ad-costs';
import { importStatsSpreadsheet } from '../stats-order-import';
import {
  REPORTING_COMPLETED_REVISION,
  REPORTING_REQUESTED_REVISION,
  startAdminReportingRefreshJob,
} from './enqueue';

export async function runStatsImportJob(
  payload: StatsImportPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  },
) {
  const legacyPayload = payload as StatsImportPayload & {
    fileName?: string;
    fileBufferBase64?: string;
  };
  const files =
    payload.files ??
    (legacyPayload.fileName && legacyPayload.fileBufferBase64
      ? [{ fileName: legacyPayload.fileName, fileBufferBase64: legacyPayload.fileBufferBase64 }]
      : []);
  const results = [];

  await helpers.updateProgress({ phase: 'importing', current: 0, total: files.length });

  for (const [index, file] of files.entries()) {
    const result = await importStatsSpreadsheet(
      Buffer.from(file.fileBufferBase64, 'base64'),
      file.fileName,
    );
    results.push({
      fileName: file.fileName,
      batchId: result.batchId,
      newOrders: result.newOrders,
      duplicateOrders: result.duplicateOrders,
      unmatchedReferences: result.unmatchedReferences.length,
    });
    await helpers.updateProgress({
      phase: 'importing',
      current: index + 1,
      total: files.length,
    });
    await helpers.updateSummary({
      fileName: file.fileName,
      currentFile: index + 1,
      totalFiles: files.length,
      batchId: result.batchId,
      newOrders: results.reduce((sum, item) => sum + item.newOrders, 0),
      duplicateOrders: results.reduce((sum, item) => sum + item.duplicateOrders, 0),
    });
  }

  const batchIds = results.map((result) => result.batchId);
  await startAdminReportingRefreshJob('stats-import', batchIds.join(','));
  await helpers.updateSummary({
    fileName: results.length === 1 ? results[0]?.fileName : `${results.length} spreadsheets`,
    batchId: batchIds.at(-1) ?? null,
    batchIds,
    files: results,
    newOrders: results.reduce((sum, item) => sum + item.newOrders, 0),
    duplicateOrders: results.reduce((sum, item) => sum + item.duplicateOrders, 0),
  });

  await helpers.updateProgress({ phase: 'completed', current: files.length, total: files.length });

  return {
    fileName: results.length === 1 ? results[0]?.fileName : `${results.length} spreadsheets`,
    batchId: batchIds.at(-1) ?? null,
    batchIds,
    files: results,
    newOrders: results.reduce((sum, item) => sum + item.newOrders, 0),
    duplicateOrders: results.reduce((sum, item) => sum + item.duplicateOrders, 0),
  };
}

export async function runAdminReportingRefreshJob(payload: ReportingRefreshPayload) {
  const redis = getRedis();
  // An older queued payload has no revision; give it one so it still refreshes.
  const revision = payload.revision ?? (await redis.incr(REPORTING_REQUESTED_REVISION));
  const completed = Number((await redis.get(REPORTING_COMPLETED_REVISION)) ?? 0);
  if (completed >= revision) return { revision, coalesced: true };
  const throughRevision = Math.max(
    revision,
    Number((await redis.get(REPORTING_REQUESTED_REVISION)) ?? 0),
  );
  const facts = await refreshAnalyticsFacts({ db: getReportingDb() });
  // Requests arriving during this pass have a higher revision and retain their
  // queued job. A failed refresh never marks its requested revision complete.
  await redis.set(REPORTING_COMPLETED_REVISION, String(throughRevision));
  return { revision: throughRevision, coalesced: false, ...facts };
}

export async function runAdCostsImportJob(
  payload: AdCostsImportPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  },
) {
  await helpers.updateProgress({ phase: 'importing', current: 0, total: 1 });
  const result = await importAdCostsSpreadsheet(
    Buffer.from(payload.fileBufferBase64, 'base64'),
    payload.rate,
    payload.fileName,
    payload.actor,
  );
  await startAdminReportingRefreshJob('ad-cost-import');
  await helpers.updateSummary({
    fileName: payload.fileName,
    batchId: result.batchId,
    total: result.total,
    imported: result.imported,
    updated: result.updated,
  });
  await helpers.updateProgress({ phase: 'completed', current: 1, total: 1 });

  return {
    fileName: payload.fileName,
    batchId: result.batchId,
    total: result.total,
    imported: result.imported,
    updated: result.updated,
  };
}
