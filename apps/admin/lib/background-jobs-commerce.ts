import { getRedis } from '@bric/runtime/redis';
import { asc, count } from 'drizzle-orm';
import {
  getJobSnapshot,
  getQueue,
  getLatestOwnedJob,
  listRecentJobSnapshots,
  requestJobCancellation,
  requestJobCancellationById,
  startOwnedJob,
} from '@bric/runtime/jobs';

import { getDb } from '@bric/db/client';
import { brands, products } from '@bric/db/schema';
import { loadOrderRecordsByIds } from './admin-orders-data';
import { syncEcotrackShipmentStates } from './admin-ecotrack-orders-data';
import {
  loadEcotrackOrderInputs,
  postOrdersToEcotrack,
  readEcotrackCatalog,
  syncEcotrackCatalog,
  type EcotrackProvider,
} from './ecotrack';
import {
  uploadExportArtifact,
  uploadPrivateExportArtifact,
  uploadStableArtifact,
} from './export-artifacts';
import {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
  buildMetaCatalogWorkbook,
  toCsvBuffer,
  toXlsxBuffer,
} from './meta-catalog';
import {
  buildOrderExportFileName,
  buildOrderExportRows,
  buildOrderExportWorkbook,
  filterRecentConfirmedOrders,
  type EcotrackCatalogExportData,
} from './order-export';
import { ORDER_STATUS } from './orders';
import { importAdCostsSpreadsheet } from './stats-ad-costs';
import { importStatsSpreadsheet } from './stats-order-import';
import { refreshAnalyticsFacts } from './analytics-facts';
import { getReportingDb } from './reporting-db';
import {
  ADMIN_AD_COST_IMPORT_QUEUE,
  ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE,
  ADMIN_ECOTRACK_SYNC_QUEUE,
  ADMIN_ORDER_ECOTRACK_QUEUE,
  ADMIN_ORDER_EXPORT_QUEUE,
  ADMIN_PRODUCT_CATALOG_FEED_QUEUE,
  ADMIN_PRODUCT_EXPORT_QUEUE,
  ADMIN_REPORTING_REFRESH_QUEUE,
  ADMIN_STATS_IMPORT_QUEUE,
  type AdCostsImportPayload,
  type AiTaskContext,
  assistantJobOrigin,
  type EcotrackShipmentSyncPayload,
  type EcotrackSyncPayload,
  type OrderEcotrackPayload,
  type OrderExportPayload,
  type ProductCatalogFeedPayload,
  type ProductExportPayload,
  type ReportingRefreshPayload,
  type StatsImportPayload,
  toClientJob,
} from './background-job-contract';

export function filterCatalogFeedProducts<T extends { active: boolean; inStock: boolean }>(
  productRows: T[],
) {
  return productRows.filter((product) => product.active && product.inStock);
}

export async function getLatestExportJob(queueName: string, ownerKey: string) {
  return toClientJob(await getLatestOwnedJob(queueName, ownerKey));
}

export async function cancelExportJob(queueName: string, ownerKey: string) {
  return toClientJob(await requestJobCancellation(queueName, ownerKey));
}

export async function getBackgroundJob(queueName: string, jobId: string) {
  return toClientJob(await getJobSnapshot(queueName, jobId));
}

export async function listRecentBackgroundJobs(
  queueNames: readonly string[],
  limit = 50,
  filters: { origin?: string } = {},
) {
  return (await listRecentJobSnapshots(queueNames, limit, filters)).map((snapshot) =>
    toClientJob(snapshot)!,
  );
}

export async function cancelBackgroundJob(queueName: string, jobId: string) {
  return toClientJob(await requestJobCancellationById(queueName, jobId));
}

export async function startProductExportJob(
  ownerKey: string,
  requestId?: string,
  taskContext: AiTaskContext = {},
) {
  const result = await startOwnedJob<ProductExportPayload>({
    queueName: ADMIN_PRODUCT_EXPORT_QUEUE,
    kind: 'product-export',
    ownerKey,
    origin: assistantJobOrigin(taskContext),
    conversationId: taskContext.conversationId,
    requestId,
    data: { ...taskContext } as ProductExportPayload,
    activeScope: 'global',
  });

  return {
    kind: result.kind,
    job: toClientJob(result.job),
  };
}

const PRODUCT_CATALOG_FEED_FILE_NAME = 'meta-catalog-feed.csv';
export const PRODUCT_CATALOG_FEED_OBJECT_KEY = 'exports/products/catalog-feed/latest.csv';
const CATALOG_FEED_REQUESTED_REVISION = `bric:${ADMIN_PRODUCT_CATALOG_FEED_QUEUE}:requested-revision`;
const CATALOG_FEED_COMPLETED_REVISION = `bric:${ADMIN_PRODUCT_CATALOG_FEED_QUEUE}:completed-revision`;

function getProductCatalogFeedDebounceMs() {
  const configured = Number(process.env.PRODUCT_CATALOG_FEED_DEBOUNCE_MS ?? 120_000);
  return Number.isFinite(configured) && configured >= 0 ? configured : 120_000;
}

export async function startProductCatalogFeedRefreshJob(
  trigger: string,
  requestId?: string,
  taskContext: AiTaskContext = {},
) {
  const revision = await getRedis().incr(CATALOG_FEED_REQUESTED_REVISION);
  // Keep a successor for edits made during an export, including across workers.
  await getQueue(ADMIN_PRODUCT_CATALOG_FEED_QUEUE).setGlobalConcurrency(1);
  const result = await startOwnedJob<ProductCatalogFeedPayload>({
    queueName: ADMIN_PRODUCT_CATALOG_FEED_QUEUE,
    kind: 'product-catalog-feed-refresh',
    ownerKey: `catalog-feed-${revision}`,
    origin: assistantJobOrigin(taskContext),
    conversationId: taskContext.conversationId,
    requestId,
    data: { trigger, revision, ...taskContext } as ProductCatalogFeedPayload,
    queueOptions: {
      delay: getProductCatalogFeedDebounceMs(),
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  });

  return {
    kind: result.kind,
    job: toClientJob(result.job, PRODUCT_CATALOG_FEED_FILE_NAME),
  };
}

export async function startOrderExportJob(
  ownerKey: string,
  payload: { mode: 'selected' | 'confirmed'; orderIds: number[] },
  requestId?: string,
  taskContext: AiTaskContext = {},
) {
  const result = await startOwnedJob<OrderExportPayload>({
    queueName: ADMIN_ORDER_EXPORT_QUEUE,
    kind: `order-export:${payload.mode}`,
    ownerKey,
    origin: assistantJobOrigin(taskContext),
    conversationId: taskContext.conversationId,
    requestId,
    data: { ...payload, ...taskContext } as OrderExportPayload,
  });

  return {
    kind: result.kind,
    job: toClientJob(result.job, buildOrderExportFileName(payload.mode)),
  };
}

export async function startOrderEcotrackJob(
  ownerKey: string,
  payload: {
    mode: 'selected' | 'confirmed';
    provider?: EcotrackProvider;
    orderIds: number[];
    actor: { email?: string | null; name?: string | null };
  },
  requestId?: string,
  taskContext: AiTaskContext = {},
) {
  const result = await startOwnedJob<OrderEcotrackPayload>({
    queueName: ADMIN_ORDER_ECOTRACK_QUEUE,
    kind: `order-ecotrack:${payload.mode}`,
    ownerKey,
    origin: assistantJobOrigin(taskContext),
    conversationId: taskContext.conversationId,
    requestId,
    data: { ...payload, ...taskContext } as OrderEcotrackPayload,
    activeScope: 'global',
  });

  return {
    kind: result.kind,
    job: toClientJob(result.job),
  };
}

export async function startStatsImportJob(
  ownerKey: string,
  payload:
    | { fileName: string; fileBuffer: Buffer }
    | { files: Array<{ fileName: string; fileBuffer: Buffer }> },
  requestId?: string,
) {
  const files = 'files' in payload ? payload.files : [payload];

  return startOwnedJob<StatsImportPayload>({
    queueName: ADMIN_STATS_IMPORT_QUEUE,
    kind: 'stats-import',
    ownerKey,
    requestId,
    data: {
      files: files.map((file) => ({
        fileName: file.fileName,
        fileBufferBase64: file.fileBuffer.toString('base64'),
      })),
    } as StatsImportPayload,
  });
}

export async function startAdCostsImportJob(
  ownerKey: string,
  payload: {
    fileName: string;
    fileBuffer: Buffer;
    rate: number;
    actor: { email?: string | null; name?: string | null };
  },
  requestId?: string,
) {
  return startOwnedJob<AdCostsImportPayload>({
    queueName: ADMIN_AD_COST_IMPORT_QUEUE,
    kind: 'ad-cost-import',
    ownerKey,
    requestId,
    data: {
      fileName: payload.fileName,
      fileBufferBase64: payload.fileBuffer.toString('base64'),
      rate: payload.rate,
      actor: payload.actor,
    } as AdCostsImportPayload,
  });
}

const REPORTING_REQUESTED_REVISION = 'bric:reporting:requested-revision';
const REPORTING_COMPLETED_REVISION = 'bric:reporting:completed-revision';

export async function startAdminReportingRefreshJob(
  trigger: string,
  sourceImportBatchId?: string | null,
  requestId?: string,
  taskContext: AiTaskContext = {},
) {
  const revision = await getRedis().incr(REPORTING_REQUESTED_REVISION);
  // One processor across overlapping worker deployments prevents older fact writes
  // from completing after a newer pass. Each request keeps its durable successor.
  await getQueue(ADMIN_REPORTING_REFRESH_QUEUE).setGlobalConcurrency(1);
  const result = await startOwnedJob<ReportingRefreshPayload>({
    queueName: ADMIN_REPORTING_REFRESH_QUEUE,
    kind: 'admin-reporting-refresh',
    ownerKey: `admin-reporting-${revision}`,
    origin: assistantJobOrigin(taskContext),
    conversationId: taskContext.conversationId,
    requestId,
    data: {
      trigger,
      revision,
      sourceImportBatchId: sourceImportBatchId ?? null,
      ...taskContext,
    } as ReportingRefreshPayload,
  });
  return { kind: result.kind, job: toClientJob(result.job) };
}

export async function startEcotrackSyncJob(
  ownerKey: string,
  trigger: string,
  actor?: { email?: string | null; name?: string | null },
  requestId?: string,
  taskContext: AiTaskContext = {},
) {
  return startOwnedJob<EcotrackSyncPayload>({
    queueName: ADMIN_ECOTRACK_SYNC_QUEUE,
    kind: 'ecotrack-sync',
    ownerKey,
    origin: assistantJobOrigin(taskContext),
    conversationId: taskContext.conversationId,
    requestId,
    data: { trigger, actor, ...taskContext } as EcotrackSyncPayload,
    activeScope: 'global',
  });
}

export async function startEcotrackShipmentSyncJob(
  ownerKey: string,
  trigger: string,
  actor?: { email?: string | null; name?: string | null },
  requestId?: string,
  taskContext: AiTaskContext = {},
) {
  return startOwnedJob<EcotrackShipmentSyncPayload>({
    queueName: ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE,
    kind: 'ecotrack-shipment-sync',
    ownerKey,
    origin: assistantJobOrigin(taskContext),
    conversationId: taskContext.conversationId,
    requestId,
    data: { trigger, actor, ...taskContext } as EcotrackShipmentSyncPayload,
    activeScope: 'global',
  });
}

export async function runProductExportJob(
  payload: ProductExportPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    setDownloadUrl: (url: string) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
) {
  const db = getDb();
  const batchSize = Math.max(Number(process.env.PRODUCT_EXPORT_BATCH_SIZE ?? 250), 1);
  const batchDelayMs = Math.max(Number(process.env.PRODUCT_EXPORT_BATCH_DELAY_MS ?? 100), 0);

  await helpers.updateProgress({ phase: 'counting', current: 0, total: 0 });
  const [brandRows, [{ value: totalProducts }]] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands),
    db.select({ value: count() }).from(products),
  ]);

  const brandNameById = new Map(brandRows.map((brand) => [brand.id, brand.name]));
  const productRows: Array<typeof products.$inferSelect> = [];
  await helpers.updateProgress({ phase: 'loading', current: 0, total: totalProducts });

  for (let offset = 0; offset < totalProducts; offset += batchSize) {
    await helpers.throwIfCancelled();
    const batch = await db
      .select()
      .from(products)
      .orderBy(asc(products.id))
      .limit(batchSize)
      .offset(offset);
    productRows.push(...batch);
    await helpers.updateProgress({
      phase: 'loading',
      current: Math.min(offset + batch.length, totalProducts),
      total: totalProducts,
    });

    if (batchDelayMs > 0 && offset + batch.length < totalProducts) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  await helpers.throwIfCancelled();
  await helpers.updateProgress({
    phase: 'packaging',
    current: totalProducts,
    total: totalProducts,
  });

  const workbook = buildMetaCatalogWorkbook(buildMetaCatalogExportRows(productRows, brandNameById));
  const fileName = buildMetaCatalogExportFileName();
  const downloadUrl = await uploadExportArtifact({
    prefix: 'exports/products',
    fileName,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: toXlsxBuffer(workbook),
  });

  await helpers.setDownloadUrl(downloadUrl);
  await helpers.updateSummary({ fileName, totalProducts });

  return {
    fileName,
    totalProducts,
  };
}

export async function runProductCatalogFeedRefreshJob(
  payload: ProductCatalogFeedPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    setDownloadUrl: (url: string) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
) {
  const redis = getRedis();
  const completedRevision = Number((await redis.get(CATALOG_FEED_COMPLETED_REVISION)) ?? 0);
  if (payload.revision !== undefined && completedRevision >= payload.revision) {
    return { revision: payload.revision, coalesced: true as const };
  }
  const throughRevision = Number((await redis.get(CATALOG_FEED_REQUESTED_REVISION)) ?? 0);
  const db = getDb();
  const batchSize = Math.max(Number(process.env.PRODUCT_EXPORT_BATCH_SIZE ?? 250), 1);

  await helpers.updateProgress({ phase: 'counting', current: 0, total: 0 });
  const [brandRows, [{ value: totalProducts }]] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands),
    db.select({ value: count() }).from(products),
  ]);

  const brandNameById = new Map(brandRows.map((brand) => [brand.id, brand.name]));
  const productRows: Array<typeof products.$inferSelect> = [];
  await helpers.updateProgress({ phase: 'loading', current: 0, total: totalProducts });

  for (let offset = 0; offset < totalProducts; offset += batchSize) {
    await helpers.throwIfCancelled();
    const batch = await db
      .select()
      .from(products)
      .orderBy(asc(products.id))
      .limit(batchSize)
      .offset(offset);
    productRows.push(...batch);
    await helpers.updateProgress({
      phase: 'loading',
      current: Math.min(offset + batch.length, totalProducts),
      total: totalProducts,
    });
  }

  await helpers.throwIfCancelled();
  const rows = buildMetaCatalogExportRows(filterCatalogFeedProducts(productRows), brandNameById);
  const downloadUrl = await uploadStableArtifact({
    key: PRODUCT_CATALOG_FEED_OBJECT_KEY,
    contentType: 'text/csv; charset=utf-8',
    body: toCsvBuffer(rows),
  });

  await helpers.setDownloadUrl(downloadUrl);
  await helpers.updateProgress({
    phase: 'packaging',
    current: totalProducts,
    total: totalProducts,
  });
  const summary = {
    fileName: PRODUCT_CATALOG_FEED_FILE_NAME,
    totalProducts: rows.length,
    sourceProductCount: totalProducts,
    trigger: payload.trigger,
    updatedAt: new Date().toISOString(),
    revision: throughRevision,
    coalesced: false as const,
  };
  await helpers.updateSummary(summary);
  await redis.set(CATALOG_FEED_COMPLETED_REVISION, String(throughRevision));
  return summary;
}

export async function runOrderExportJob(
  payload: OrderExportPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    setDownloadUrl: (url: string) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
) {
  await helpers.updateProgress({ phase: 'loading', current: 0, total: payload.orderIds.length });
  const selectedOrders = await loadOrderRecordsByIds([...payload.orderIds].sort((a, b) => a - b));
  const exportOrders =
    payload.mode === 'confirmed'
      ? filterRecentConfirmedOrders(
          selectedOrders.filter((order) => order.inHouseStatus === ORDER_STATUS.CONFIRMED),
        )
      : selectedOrders;
  await helpers.throwIfCancelled();

  const catalog = await readEcotrackCatalog(getDb());
  const exportRows = buildOrderExportRows(
    exportOrders,
    catalog satisfies EcotrackCatalogExportData,
  );
  await helpers.updateProgress({
    phase: 'exporting',
    current: exportRows.length,
    total: exportRows.length,
  });

  const fileName = buildOrderExportFileName(payload.mode);
  const workbook = buildOrderExportWorkbook(exportRows);
  const artifact = await uploadPrivateExportArtifact({
    prefix: 'exports/orders',
    fileName,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: toXlsxBuffer(workbook),
  });

  await helpers.setDownloadUrl(
    `/api/orders/export/download?jobId=${encodeURIComponent(payload.__jobMeta.id)}`,
  );
  const summary = {
    fileName,
    mode: payload.mode,
    totalOrders: exportOrders.length,
    artifactKey: artifact.key,
    artifactExpiresAt: artifact.expiresAt.toISOString(),
  };
  await helpers.updateSummary(summary);
  return summary;
}

export async function runOrderEcotrackJob(
  payload: OrderEcotrackPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
) {
  const db = getDb();

  await helpers.updateProgress({ phase: 'loading', current: 0, total: payload.orderIds.length });
  const [items, catalog] = await Promise.all([
    loadEcotrackOrderInputs(db, payload.mode, payload.orderIds),
    readEcotrackCatalog(db),
  ]);
  await helpers.updateProgress({
    phase: 'loading',
    current: items.length,
    total: payload.orderIds.length,
  });
  await helpers.throwIfCancelled();

  return postOrdersToEcotrack(db, items, catalog, payload.actor, {
    provider: payload.provider ?? 'delivro',
    throwIfCancelled: helpers.throwIfCancelled,
    updateProgress: helpers.updateProgress,
    updateSummary: async (summary) => {
      await helpers.updateSummary({ ...summary });
    },
  });
}

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

export async function runEcotrackSyncJob(
  payload: EcotrackSyncPayload,
  helpers: {
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  },
) {
  const result = await syncEcotrackCatalog(getDb(), {
    trigger: payload.trigger,
    actor: payload.actor,
  });
  const summary = { ...result };
  await helpers.updateSummary(summary);
  return summary;
}

export async function runEcotrackShipmentSyncJob(
  payload: EcotrackShipmentSyncPayload,
  helpers: {
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  },
) {
  const result = await syncEcotrackShipmentStates({ actor: payload.actor });
  await refreshAnalyticsFacts({ db: getReportingDb() });
  const summary = {
    trigger: payload.trigger,
    ...result,
  };
  await helpers.updateSummary(summary);
  return summary;
}
