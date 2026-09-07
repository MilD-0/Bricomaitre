import {
  getJobSnapshot,
  getLatestOwnedJob,
  getQueue,
  listRecentJobSnapshots,
  requestJobCancellation,
  requestJobCancellationById,
  startOwnedJob,
} from '@bric/runtime/jobs';
import { getRedis } from '@bric/runtime/redis';
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
  assistantJobOrigin,
  toClientJob,
  type AdCostsImportPayload,
  type AiTaskContext,
  type EcotrackShipmentSyncPayload,
  type EcotrackSyncPayload,
  type OrderEcotrackPayload,
  type OrderExportPayload,
  type ProductCatalogFeedPayload,
  type ProductExportPayload,
  type ReportingRefreshPayload,
  type StatsImportPayload,
} from '../background-job-contract';
import { type EcotrackProvider } from '../ecotrack';
import { buildOrderExportFileName } from '../order-export';

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

export const PRODUCT_CATALOG_FEED_FILE_NAME = 'meta-catalog-feed.csv';

export const PRODUCT_CATALOG_FEED_OBJECT_KEY = 'exports/products/catalog-feed/latest.csv';

export const CATALOG_FEED_REQUESTED_REVISION = `bric:${ADMIN_PRODUCT_CATALOG_FEED_QUEUE}:requested-revision`;

export const CATALOG_FEED_COMPLETED_REVISION = `bric:${ADMIN_PRODUCT_CATALOG_FEED_QUEUE}:completed-revision`;

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

export const REPORTING_REQUESTED_REVISION = 'bric:reporting:requested-revision';

export const REPORTING_COMPLETED_REVISION = 'bric:reporting:completed-revision';

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
