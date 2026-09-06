import type { JobSnapshot } from '@bric/runtime/jobs';

import type { EcotrackProvider } from './ecotrack';

export const ADMIN_PRODUCT_EXPORT_QUEUE = 'admin-product-export';
export const ADMIN_PRODUCT_CATALOG_FEED_QUEUE = 'admin-product-catalog-feed';
export const ADMIN_ORDER_EXPORT_QUEUE = 'admin-order-export';
export const ADMIN_ORDER_ECOTRACK_QUEUE = 'admin-order-ecotrack';
export const ADMIN_STATS_IMPORT_QUEUE = 'admin-stats-import';
export const ADMIN_AD_COST_IMPORT_QUEUE = 'admin-ad-cost-import';
export const ADMIN_REPORTING_REFRESH_QUEUE = 'admin-reporting-refresh';
export const ADMIN_ECOTRACK_SYNC_QUEUE = 'admin-ecotrack-sync';
export const ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE = 'admin-ecotrack-shipment-sync';
export const ADMIN_AI_CONTENT_QUEUE = 'admin-ai-content';
export const ADMIN_AI_CATEGORIZATION_QUEUE = 'admin-ai-categorization';
export const ADMIN_AI_LANDING_PAGE_QUEUE = 'admin-ai-landing-page';

export type QueueJobMeta = {
  __jobMeta: {
    id: string;
    ownerKey: string;
    queueName: string;
    activeScope: 'owner' | 'global';
  };
};

export type AiTaskContext = {
  conversationId?: number;
};

export const ADMIN_AI_ASSISTANT_JOB_ORIGIN = 'admin-ai-assistant';

export function assistantJobOrigin(taskContext: AiTaskContext) {
  return taskContext.conversationId ? ADMIN_AI_ASSISTANT_JOB_ORIGIN : undefined;
}

export type ExportJobResponse = {
  job: {
    id: string;
    queue: string;
    kind: string;
    origin: string | null;
    conversationId: number | null;
    status: JobSnapshot['status'];
    fileName: string | null;
    progress: JobSnapshot['progress'];
    errorMessage: string | null;
    downloadPath: string | null;
    resultSummary: Record<string, unknown> | null;
  } | null;
};

export type ProductExportPayload = QueueJobMeta & AiTaskContext;
export type ProductCatalogFeedPayload = QueueJobMeta &
  AiTaskContext & {
    trigger: string;
  };
export type OrderExportPayload = QueueJobMeta &
  AiTaskContext & {
    mode: 'selected' | 'confirmed';
    orderIds: number[];
  };
export type OrderEcotrackPayload = QueueJobMeta &
  AiTaskContext & {
    mode: 'selected' | 'confirmed';
    provider?: EcotrackProvider;
    orderIds: number[];
    actor: {
      email?: string | null;
      name?: string | null;
    };
  };
export type StatsImportPayload = QueueJobMeta &
  AiTaskContext & {
    files: Array<{
      fileName: string;
      fileBufferBase64: string;
    }>;
  };
export type AdCostsImportPayload = QueueJobMeta &
  AiTaskContext & {
    fileName: string;
    fileBufferBase64: string;
    rate: number;
    actor: {
      email?: string | null;
      name?: string | null;
    };
  };
export type ReportingRefreshPayload = QueueJobMeta &
  AiTaskContext & {
    trigger: string;
    revision?: number;
    sourceImportBatchId?: string | null;
  };
export type EcotrackSyncPayload = QueueJobMeta &
  AiTaskContext & {
    trigger: string;
    actor?: {
      email?: string | null;
      name?: string | null;
    };
  };
export type EcotrackShipmentSyncPayload = QueueJobMeta &
  AiTaskContext & {
    trigger: string;
    actor?: {
      email?: string | null;
      name?: string | null;
    };
  };
export type AiContentPayload = QueueJobMeta &
  AiTaskContext & {
    productIds: number[] | null;
    fields: Array<'title' | 'titleAr' | 'description' | 'descriptionAr'>;
    onlyMissing: boolean;
    autoApply: boolean;
    context?: string;
    actor: { email?: string | null; name?: string | null };
  };
export type AiCategorizationPayload = QueueJobMeta &
  AiTaskContext & {
    scope: 'all_active' | 'uncategorized';
    confidenceThreshold: number;
    batchSize: number;
    autoApply: boolean;
    context?: string;
    actor: { email?: string | null; name?: string | null };
  };
export type AiLandingPagePayload = QueueJobMeta &
  AiTaskContext & {
    work:
      | {
          operation: 'create';
          productId: number;
          locale: 'fr' | 'ar';
          creativeBrief?: string;
          publish: boolean;
        }
      | {
          operation: 'revise';
          landingPageId: number;
          expectedRevision: number;
          instruction: string;
          targetBlockIds: string[];
          deleteBlockIds: string[];
          allowStructuralChanges: boolean;
          publication: 'preserve' | 'publish' | 'draft';
        };
    actor: { email?: string | null; name?: string | null };
  };

export function toClientJob(
  snapshot: JobSnapshot | null,
  fileName: string | null = null,
): ExportJobResponse['job'] {
  if (!snapshot) return null;

  const summaryFileName =
    typeof snapshot.resultSummary?.fileName === 'string'
      ? snapshot.resultSummary.fileName
      : fileName;

  return {
    id: snapshot.id,
    queue: snapshot.queue,
    kind: snapshot.kind,
    origin: snapshot.origin ?? null,
    conversationId: snapshot.conversationId ?? null,
    status: snapshot.status,
    fileName: summaryFileName ?? null,
    progress: snapshot.progress,
    errorMessage: snapshot.errorMessage,
    downloadPath: snapshot.downloadUrl,
    resultSummary: snapshot.resultSummary,
  };
}
