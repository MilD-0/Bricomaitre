import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { getLatestOwnedJob, requestJobCancellation, startOwnedJob, type JobSnapshot } from '@bric/runtime/jobs';
import { storefrontAnalyticsEventSchema, ingestStorefrontAnalyticsEvent } from '@bric/storefront-core/analytics';
import { getOrderProductLookup, toOrderRecord } from '@bric/storefront-core/order-records';

import { getDb } from '../db/client';
import {
  adminReportingSnapshotRuns,
  brands,
  orderStatusHistory,
  orders,
  products,
} from '../db/schema';
import { syncEcotrackShipmentStates } from './admin-ecotrack-orders-data';
import { loadEcotrackOrderInputs, postOrdersToEcotrack, readEcotrackCatalog, syncEcotrackCatalog } from './ecotrack';
import { uploadExportArtifact, uploadStableArtifact } from './export-artifacts';
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
import type { OrderStatusHistoryRecord } from './orders';
import { importAdCostsSpreadsheet, importStatsSpreadsheet, refreshAdminReportingSnapshots } from './stats';

export const ADMIN_PRODUCT_EXPORT_QUEUE = 'admin-product-export';
export const ADMIN_PRODUCT_CATALOG_FEED_QUEUE = 'admin-product-catalog-feed';
export const ADMIN_ORDER_EXPORT_QUEUE = 'admin-order-export';
export const ADMIN_ORDER_ECOTRACK_QUEUE = 'admin-order-ecotrack';
export const ADMIN_STATS_IMPORT_QUEUE = 'admin-stats-import';
export const ADMIN_AD_COST_IMPORT_QUEUE = 'admin-ad-cost-import';
export const ADMIN_REPORTING_REFRESH_QUEUE = 'admin-reporting-refresh';
export const ADMIN_ECOTRACK_SYNC_QUEUE = 'admin-ecotrack-sync';
export const ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE = 'admin-ecotrack-shipment-sync';
export const STOREFRONT_ANALYTICS_QUEUE = 'storefront-analytics';

type QueueJobMeta = {
  __jobMeta: {
    id: string;
    ownerKey: string;
    queueName: string;
    activeScope: 'owner' | 'global';
  };
};

export type ExportJobResponse = {
  job: {
    id: string;
    status: JobSnapshot['status'];
    fileName: string | null;
    progress: JobSnapshot['progress'];
    errorMessage: string | null;
    downloadPath: string | null;
    resultSummary: Record<string, unknown> | null;
  } | null;
};

type ProductExportPayload = QueueJobMeta;
type ProductCatalogFeedPayload = QueueJobMeta & {
  trigger: string;
};
type OrderExportPayload = QueueJobMeta & {
  mode: 'selected' | 'confirmed';
  orderIds: number[];
};
type OrderEcotrackPayload = QueueJobMeta & {
  mode: 'selected' | 'confirmed';
  orderIds: number[];
  actor: {
    email?: string | null;
    name?: string | null;
  };
};
type StatsImportPayload = QueueJobMeta & {
  files: Array<{
    fileName: string;
    fileBufferBase64: string;
  }>;
};
type AdCostsImportPayload = QueueJobMeta & {
  fileName: string;
  fileBufferBase64: string;
  rate: number;
  actor: {
    email?: string | null;
    name?: string | null;
  };
};
type ReportingRefreshPayload = QueueJobMeta & {
  trigger: string;
  sourceImportBatchId?: string | null;
};
type EcotrackSyncPayload = QueueJobMeta & {
  trigger: string;
  actor?: {
    email?: string | null;
    name?: string | null;
  };
};
type EcotrackShipmentSyncPayload = QueueJobMeta & {
  trigger: string;
  actor?: {
    email?: string | null;
    name?: string | null;
  };
};
type AnalyticsPayload = {
  event: ReturnType<typeof storefrontAnalyticsEventSchema.parse>;
};

export function filterCatalogFeedProducts<T extends { active: boolean; inStock: boolean }>(productRows: T[]) {
  return productRows.filter((product) => product.active && product.inStock);
}

function toClientJob(snapshot: JobSnapshot | null, fileName: string | null = null): ExportJobResponse['job'] {
  if (!snapshot) {
    return null;
  }

  const summaryFileName = typeof snapshot.resultSummary?.fileName === 'string'
    ? snapshot.resultSummary.fileName
    : fileName;

  return {
    id: snapshot.id,
    status: snapshot.status,
    fileName: summaryFileName ?? null,
    progress: snapshot.progress,
    errorMessage: snapshot.errorMessage,
    downloadPath: snapshot.downloadUrl,
    resultSummary: snapshot.resultSummary,
  };
}

export async function getLatestExportJob(queueName: string, ownerKey: string) {
  return toClientJob(await getLatestOwnedJob(queueName, ownerKey));
}

export async function cancelExportJob(queueName: string, ownerKey: string) {
  return toClientJob(await requestJobCancellation(queueName, ownerKey));
}

export async function startProductExportJob(ownerKey: string, requestId?: string) {
  const result = await startOwnedJob<ProductExportPayload>({
    queueName: ADMIN_PRODUCT_EXPORT_QUEUE,
    kind: 'product-export',
    ownerKey,
    requestId,
    data: {} as ProductExportPayload,
    activeScope: 'global',
  });

  return {
    kind: result.kind,
    job: toClientJob(result.job),
  };
}

const PRODUCT_CATALOG_FEED_OWNER_KEY = 'catalog-feed';
const PRODUCT_CATALOG_FEED_FILE_NAME = 'meta-catalog-feed.csv';
export const PRODUCT_CATALOG_FEED_OBJECT_KEY = 'exports/products/catalog-feed/latest.csv';

function getProductCatalogFeedDebounceMs() {
  const configured = Number(process.env.PRODUCT_CATALOG_FEED_DEBOUNCE_MS ?? 120_000);
  return Number.isFinite(configured) && configured >= 0 ? configured : 120_000;
}

export async function startProductCatalogFeedRefreshJob(trigger: string, requestId?: string) {
  const latest = await getLatestOwnedJob(ADMIN_PRODUCT_CATALOG_FEED_QUEUE, PRODUCT_CATALOG_FEED_OWNER_KEY);
  if (latest) {
    const isActive = latest.status === 'queued' || latest.status === 'running';
    const withinDebounce = Date.now() - Date.parse(latest.updatedAt) < getProductCatalogFeedDebounceMs();

    if (isActive || withinDebounce) {
      return {
        kind: 'existing' as const,
        job: toClientJob(latest, PRODUCT_CATALOG_FEED_FILE_NAME),
      };
    }
  }

  const result = await startOwnedJob<ProductCatalogFeedPayload>({
    queueName: ADMIN_PRODUCT_CATALOG_FEED_QUEUE,
    kind: 'product-catalog-feed-refresh',
    ownerKey: PRODUCT_CATALOG_FEED_OWNER_KEY,
    requestId,
    data: { trigger } as ProductCatalogFeedPayload,
    activeScope: 'global',
  });

  return {
    kind: result.kind,
    job: toClientJob(result.job, PRODUCT_CATALOG_FEED_FILE_NAME),
  };
}

export async function startOrderExportJob(ownerKey: string, payload: { mode: 'selected' | 'confirmed'; orderIds: number[] }, requestId?: string) {
  const result = await startOwnedJob<OrderExportPayload>({
    queueName: ADMIN_ORDER_EXPORT_QUEUE,
    kind: `order-export:${payload.mode}`,
    ownerKey,
    requestId,
    data: payload as OrderExportPayload,
  });

  return {
    kind: result.kind,
    job: toClientJob(result.job, buildOrderExportFileName(payload.mode)),
  };
}

export async function startOrderEcotrackJob(
  ownerKey: string,
  payload: { mode: 'selected' | 'confirmed'; orderIds: number[]; actor: { email?: string | null; name?: string | null } },
  requestId?: string,
) {
  const result = await startOwnedJob<OrderEcotrackPayload>({
    queueName: ADMIN_ORDER_ECOTRACK_QUEUE,
    kind: `order-ecotrack:${payload.mode}`,
    ownerKey,
    requestId,
    data: payload as OrderEcotrackPayload,
    activeScope: 'global',
  });

  return {
    kind: result.kind,
    job: toClientJob(result.job),
  };
}

export async function startStatsImportJob(ownerKey: string, payload: { fileName: string; fileBuffer: Buffer } | { files: Array<{ fileName: string; fileBuffer: Buffer }> }, requestId?: string) {
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

export async function startAdCostsImportJob(ownerKey: string, payload: { fileName: string; fileBuffer: Buffer; rate: number; actor: { email?: string | null; name?: string | null } }, requestId?: string) {
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

export async function startAdminReportingRefreshJob(trigger: string, sourceImportBatchId?: string | null, requestId?: string) {
  const result = await startOwnedJob<ReportingRefreshPayload>({
    queueName: ADMIN_REPORTING_REFRESH_QUEUE,
    kind: 'admin-reporting-refresh',
    ownerKey: 'admin-reporting',
    requestId,
    activeScope: 'global',
    data: {
      trigger,
      sourceImportBatchId: sourceImportBatchId ?? null,
    } as ReportingRefreshPayload,
  });

  if (result.kind !== 'started') {
    await getDb()
      .update(adminReportingSnapshotRuns)
      .set({
        pendingRefresh: true,
        pendingTrigger: trigger,
        updatedAt: new Date(),
      })
      .where(eq(adminReportingSnapshotRuns.runId, result.job.id));
  }

  return {
    kind: result.kind,
    job: toClientJob(result.job),
  };
}

export async function startEcotrackSyncJob(
  ownerKey: string,
  trigger: string,
  actor?: { email?: string | null; name?: string | null },
  requestId?: string,
) {
  return startOwnedJob<EcotrackSyncPayload>({
    queueName: ADMIN_ECOTRACK_SYNC_QUEUE,
    kind: 'ecotrack-sync',
    ownerKey,
    requestId,
    data: { trigger, actor } as EcotrackSyncPayload,
    activeScope: 'global',
  });
}

export async function startEcotrackShipmentSyncJob(
  ownerKey: string,
  trigger: string,
  actor?: { email?: string | null; name?: string | null },
  requestId?: string,
) {
  return startOwnedJob<EcotrackShipmentSyncPayload>({
    queueName: ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE,
    kind: 'ecotrack-shipment-sync',
    ownerKey,
    requestId,
    data: { trigger, actor } as EcotrackShipmentSyncPayload,
    activeScope: 'global',
  });
}

export async function enqueueAnalyticsEvent(event: ReturnType<typeof storefrontAnalyticsEventSchema.parse>, requestId?: string) {
  return startOwnedJob<AnalyticsPayload>({
    queueName: STOREFRONT_ANALYTICS_QUEUE,
    kind: 'analytics-event',
    ownerKey: event.eventId,
    requestId,
    data: { event },
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
    const batch = await db.select().from(products).orderBy(asc(products.id)).limit(batchSize).offset(offset);
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

  await helpers.updateProgress({ phase: 'processing-images', current: 0, total: totalProducts });
  const imageLinkByProductId = new Map<number, string>();

  for (let index = 0; index < productRows.length; index += 1) {
    await helpers.throwIfCancelled();
    const product = productRows[index];
    const primaryImage = product.images[0];
    if (primaryImage) {
      imageLinkByProductId.set(product.id, primaryImage);
    }
    await helpers.updateProgress({ phase: 'processing-images', current: index + 1, total: totalProducts });
  }

  await helpers.throwIfCancelled();
  await helpers.updateProgress({ phase: 'packaging', current: totalProducts, total: totalProducts });

  const workbook = buildMetaCatalogWorkbook(
    buildMetaCatalogExportRows(productRows, brandNameById, imageLinkByProductId),
  );
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
    const batch = await db.select().from(products).orderBy(asc(products.id)).limit(batchSize).offset(offset);
    productRows.push(...batch);
    await helpers.updateProgress({
      phase: 'loading',
      current: Math.min(offset + batch.length, totalProducts),
      total: totalProducts,
    });
  }

  await helpers.updateProgress({ phase: 'processing-images', current: 0, total: totalProducts });
  const imageLinkByProductId = new Map<number, string>();

  for (let index = 0; index < productRows.length; index += 1) {
    await helpers.throwIfCancelled();
    const product = productRows[index];
    if (product.images[0]) {
      imageLinkByProductId.set(product.id, product.images[0]);
    }
    await helpers.updateProgress({ phase: 'processing-images', current: index + 1, total: totalProducts });
  }

  await helpers.throwIfCancelled();
  const rows = buildMetaCatalogExportRows(
    filterCatalogFeedProducts(productRows),
    brandNameById,
    imageLinkByProductId,
  );
  const downloadUrl = await uploadStableArtifact({
    key: PRODUCT_CATALOG_FEED_OBJECT_KEY,
    contentType: 'text/csv; charset=utf-8',
    body: toCsvBuffer(rows),
  });

  await helpers.setDownloadUrl(downloadUrl);
  await helpers.updateProgress({ phase: 'packaging', current: totalProducts, total: totalProducts });
  await helpers.updateSummary({
    fileName: PRODUCT_CATALOG_FEED_FILE_NAME,
    totalProducts: rows.length,
    sourceProductCount: totalProducts,
    trigger: payload.trigger,
    updatedAt: new Date().toISOString(),
  });

  return {
    fileName: PRODUCT_CATALOG_FEED_FILE_NAME,
    totalProducts: rows.length,
  };
}

async function loadOrdersForExport(mode: 'selected' | 'confirmed', orderIds: number[]) {
  const db = getDb();
  const orderRows = await db.query.orders.findMany({
    where: mode === 'confirmed'
      ? and(eq(orders.confirmed, 2), isNull(orders.archivedAt), inArray(orders.id, orderIds))
      : and(isNull(orders.archivedAt), inArray(orders.id, orderIds)),
    orderBy: [asc(orders.id)],
  });
  const historyRows = await db.query.orderStatusHistory.findMany({
    where: inArray(orderStatusHistory.orderId, orderRows.map((row) => row.id)),
    orderBy: [asc(orderStatusHistory.changedAt)],
  });
  const historyByOrderId = new Map<number, OrderStatusHistoryRecord[]>();
  for (const row of historyRows) {
    const list = historyByOrderId.get(row.orderId) ?? [];
    list.push({
      id: row.id,
      status: row.status as OrderStatusHistoryRecord['status'],
      noAnswerCount: row.noAnswerCount,
      changedAt: row.changedAt.toISOString(),
      changedBy: row.changedBy,
      changedByName: row.changedByName,
    });
    historyByOrderId.set(row.orderId, list);
  }

  const productLookup = await getOrderProductLookup(db, orderRows);
  const exportOrders = orderRows.map((row) => toOrderRecord(row, historyByOrderId.get(row.id) ?? [], productLookup));

  return mode === 'confirmed' ? filterRecentConfirmedOrders(exportOrders) : exportOrders;
}

async function markOrdersAsDispatched(orderIds: number[]) {
  const db = getDb();
  const now = new Date();

  for (const orderId of orderIds) {
    const [updatedOrder] = await db
      .update(orders)
      .set({
        confirmed: 3,
        noAnswerCount: 0,
        updatedAt: now,
      })
      .where(eq(orders.id, orderId))
      .returning();

    if (!updatedOrder) {
      continue;
    }

    await db.insert(orderStatusHistory).values({
      orderId,
      status: 3,
      noAnswerCount: 0,
      changedAt: now,
    });
  }
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
  const exportOrders = await loadOrdersForExport(payload.mode, payload.orderIds);
  await helpers.throwIfCancelled();

  const catalog = await readEcotrackCatalog(getDb());
  const exportRows = buildOrderExportRows(exportOrders, catalog satisfies EcotrackCatalogExportData);
  await helpers.updateProgress({ phase: 'exporting', current: exportRows.length, total: exportRows.length });

  const fileName = buildOrderExportFileName(payload.mode);
  const workbook = buildOrderExportWorkbook(exportRows);
  const downloadUrl = await uploadExportArtifact({
    prefix: 'exports/orders',
    fileName,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: toXlsxBuffer(workbook),
  });

  await helpers.setDownloadUrl(downloadUrl);
  await helpers.updateSummary({ fileName, mode: payload.mode, totalOrders: exportOrders.length });

  if (payload.mode === 'confirmed') {
    await helpers.updateProgress({ phase: 'updating-statuses', current: 0, total: exportOrders.length });
    for (let index = 0; index < exportOrders.length; index += 1) {
      await helpers.throwIfCancelled();
      await markOrdersAsDispatched([exportOrders[index].id]);
      await helpers.updateProgress({ phase: 'updating-statuses', current: index + 1, total: exportOrders.length });
    }
  }

  return {
    fileName,
    mode: payload.mode,
    totalOrders: exportOrders.length,
  };
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
  await helpers.updateProgress({ phase: 'loading', current: items.length, total: payload.orderIds.length });
  await helpers.throwIfCancelled();

  return postOrdersToEcotrack(db, items, catalog, payload.actor, {
    throwIfCancelled: helpers.throwIfCancelled,
    updateProgress: helpers.updateProgress,
    updateSummary: async (summary) => {
      await helpers.updateSummary(summary as unknown as Record<string, unknown>);
    },
  });
}

export async function runStatsImportJob(
  payload: StatsImportPayload,
  helpers: {
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  },
) {
  const legacyPayload = payload as StatsImportPayload & { fileName?: string; fileBufferBase64?: string };
  const files = payload.files ?? (
    legacyPayload.fileName && legacyPayload.fileBufferBase64
      ? [{ fileName: legacyPayload.fileName, fileBufferBase64: legacyPayload.fileBufferBase64 }]
      : []
  );
  const results = [];

  for (const [index, file] of files.entries()) {
    const result = await importStatsSpreadsheet(Buffer.from(file.fileBufferBase64, 'base64'), file.fileName);
    results.push({
      fileName: file.fileName,
      batchId: result.batchId,
      newOrders: result.newOrders,
      duplicateOrders: result.duplicateOrders,
      unmatchedReferences: result.unmatchedReferences.length,
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
  const result = await refreshAdminReportingSnapshots({
    runId: payload.__jobMeta.id,
    trigger: payload.trigger,
    sourceImportBatchId: payload.sourceImportBatchId ?? null,
  });
  const db = getDb();
  const [run] = await db
    .select({
      pendingRefresh: adminReportingSnapshotRuns.pendingRefresh,
      pendingTrigger: adminReportingSnapshotRuns.pendingTrigger,
    })
    .from(adminReportingSnapshotRuns)
    .where(eq(adminReportingSnapshotRuns.runId, payload.__jobMeta.id))
    .limit(1);

  if (!run?.pendingRefresh) {
    return result;
  }

  const pendingTrigger = run.pendingTrigger || 'coalesced-refresh';
  await db
    .update(adminReportingSnapshotRuns)
    .set({
      pendingRefresh: false,
      pendingTrigger: null,
      updatedAt: new Date(),
    })
    .where(eq(adminReportingSnapshotRuns.runId, payload.__jobMeta.id));

  return refreshAdminReportingSnapshots({
    runId: payload.__jobMeta.id,
    trigger: pendingTrigger,
    sourceImportBatchId: payload.sourceImportBatchId ?? null,
  });
}

export async function runAdCostsImportJob(
  payload: AdCostsImportPayload,
  helpers: {
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  },
) {
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
  const result = await syncEcotrackCatalog(getDb(), { trigger: payload.trigger, actor: payload.actor });
  await helpers.updateSummary(result as unknown as Record<string, unknown>);
  return result as unknown as Record<string, unknown>;
}

export async function runEcotrackShipmentSyncJob(
  payload: EcotrackShipmentSyncPayload,
  helpers: {
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  },
) {
  const result = await syncEcotrackShipmentStates({ actor: payload.actor });
  const summary = {
    trigger: payload.trigger,
    ...result,
  };
  await helpers.updateSummary(summary);
  return summary;
}

export async function runAnalyticsJob(payload: AnalyticsPayload) {
  return ingestStorefrontAnalyticsEvent(getDb(), payload.event);
}
