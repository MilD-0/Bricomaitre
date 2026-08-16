import {
  ADMIN_AD_COST_IMPORT_QUEUE,
  ADMIN_AI_CATEGORIZATION_QUEUE,
  ADMIN_AI_CONTENT_QUEUE,
  ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE,
  ADMIN_ECOTRACK_SYNC_QUEUE,
  ADMIN_ORDER_ECOTRACK_QUEUE,
  ADMIN_ORDER_EXPORT_QUEUE,
  ADMIN_PRODUCT_CATALOG_FEED_QUEUE,
  ADMIN_PRODUCT_EXPORT_QUEUE,
  ADMIN_REPORTING_REFRESH_QUEUE,
  ADMIN_STATS_IMPORT_QUEUE,
  STOREFRONT_ANALYTICS_QUEUE,
  cancelBackgroundJob,
  getBackgroundJob,
  listRecentBackgroundJobs,
  startAdminReportingRefreshJob,
  startEcotrackShipmentSyncJob,
  startEcotrackSyncJob,
  startOrderExportJob,
  startProductCatalogFeedRefreshJob,
  startProductExportJob,
} from './background-jobs';

export const ADMIN_BACKGROUND_JOB_TYPES = [
  'ai_categorization',
  'ai_content',
  'product_export',
  'catalog_feed_refresh',
  'order_export',
  'order_ecotrack',
  'stats_import',
  'ad_cost_import',
  'reporting_refresh',
  'ecotrack_catalog_sync',
  'ecotrack_shipment_sync',
  'storefront_analytics',
] as const;

export type AdminBackgroundJobType = (typeof ADMIN_BACKGROUND_JOB_TYPES)[number];

export const STARTABLE_ADMIN_BACKGROUND_JOB_TYPES = [
  'product_export',
  'catalog_feed_refresh',
  'order_export',
  'reporting_refresh',
  'ecotrack_catalog_sync',
  'ecotrack_shipment_sync',
] as const;

export type StartableAdminBackgroundJobType = (typeof STARTABLE_ADMIN_BACKGROUND_JOB_TYPES)[number];

const CANCELLABLE_ADMIN_BACKGROUND_JOB_TYPES = [
  'ai_categorization',
  'ai_content',
  'product_export',
  'catalog_feed_refresh',
  'order_export',
  'order_ecotrack',
] as const;

const queueByType: Record<AdminBackgroundJobType, string> = {
  ai_categorization: ADMIN_AI_CATEGORIZATION_QUEUE,
  ai_content: ADMIN_AI_CONTENT_QUEUE,
  product_export: ADMIN_PRODUCT_EXPORT_QUEUE,
  catalog_feed_refresh: ADMIN_PRODUCT_CATALOG_FEED_QUEUE,
  order_export: ADMIN_ORDER_EXPORT_QUEUE,
  order_ecotrack: ADMIN_ORDER_ECOTRACK_QUEUE,
  stats_import: ADMIN_STATS_IMPORT_QUEUE,
  ad_cost_import: ADMIN_AD_COST_IMPORT_QUEUE,
  reporting_refresh: ADMIN_REPORTING_REFRESH_QUEUE,
  ecotrack_catalog_sync: ADMIN_ECOTRACK_SYNC_QUEUE,
  ecotrack_shipment_sync: ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE,
  storefront_analytics: STOREFRONT_ANALYTICS_QUEUE,
};

const allAdminQueues = [...new Set(Object.values(queueByType))];
const cancellableTypes = new Set<AdminBackgroundJobType>(CANCELLABLE_ADMIN_BACKGROUND_JOB_TYPES);
const typeByQueue = new Map(
  Object.entries(queueByType).map(([type, queue]) => [queue, type as AdminBackgroundJobType]),
);

export async function listAdminBackgroundJobs(limit = 30) {
  return (await listRecentBackgroundJobs(allAdminQueues, limit)).map((job) => {
    const type = typeByQueue.get(job.queue);
    return {
      ...job,
      type,
      cancellable: type ? cancellableTypes.has(type) : false,
    };
  });
}

export async function getAdminBackgroundJob(type: AdminBackgroundJobType, jobId: string) {
  return getBackgroundJob(queueByType[type], jobId);
}

export async function cancelAdminBackgroundJob(type: AdminBackgroundJobType, jobId: string) {
  if (!cancellableTypes.has(type)) {
    return {
      error: `${type} does not support cooperative cancellation once started.`,
      job: await getAdminBackgroundJob(type, jobId),
    };
  }

  const job = await cancelBackgroundJob(queueByType[type], jobId);
  return job
    ? { job }
    : { error: 'The job was not found or is no longer queued/running.', job: null };
}

export async function startAdminBackgroundJob(input: {
  type: StartableAdminBackgroundJobType;
  actor: { email: string; name?: string | null };
  conversationId?: number;
  orderMode?: 'selected' | 'confirmed';
  orderIds?: number[];
}) {
  const trigger = `ai-assistant:${input.actor.email}`;
  const taskContext = { conversationId: input.conversationId };
  switch (input.type) {
    case 'product_export':
      return startProductExportJob(input.actor.email, undefined, taskContext);
    case 'catalog_feed_refresh':
      return startProductCatalogFeedRefreshJob(trigger, undefined, taskContext);
    case 'order_export': {
      const orderIds = [...new Set(input.orderIds ?? [])];
      if (!input.orderMode || orderIds.length === 0) {
        return {
          error: 'orderMode and at least one resolved order ID are required for an order export.',
        };
      }
      return startOrderExportJob(
        input.actor.email,
        { mode: input.orderMode, orderIds },
        undefined,
        taskContext,
      );
    }
    case 'reporting_refresh':
      return startAdminReportingRefreshJob(trigger, null, undefined, taskContext);
    case 'ecotrack_catalog_sync':
      return startEcotrackSyncJob(input.actor.email, trigger, input.actor, undefined, taskContext);
    case 'ecotrack_shipment_sync':
      return startEcotrackShipmentSyncJob(
        input.actor.email,
        trigger,
        input.actor,
        undefined,
        taskContext,
      );
  }
}
