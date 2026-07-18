import * as Sentry from '@sentry/node';
import { createQueueWorker } from '@bric/runtime/jobs';
import cron from 'node-cron';

import { readSampleRate } from '../lib/sentry';
import {
  ADMIN_AD_COST_IMPORT_QUEUE,
  ADMIN_ECOTRACK_SYNC_QUEUE,
  ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE,
  ADMIN_ORDER_ECOTRACK_QUEUE,
  ADMIN_ORDER_EXPORT_QUEUE,
  ADMIN_PRODUCT_CATALOG_FEED_QUEUE,
  ADMIN_PRODUCT_EXPORT_QUEUE,
  ADMIN_REPORTING_REFRESH_QUEUE,
  ADMIN_STATS_IMPORT_QUEUE,
  STOREFRONT_ANALYTICS_QUEUE,
  ADMIN_AI_CONTENT_QUEUE,
  runAdCostsImportJob,
  runAnalyticsJob,
  runEcotrackShipmentSyncJob,
  runEcotrackSyncJob,
  runOrderEcotrackJob,
  runOrderExportJob,
  runProductCatalogFeedRefreshJob,
  runProductExportJob,
  runAdminReportingRefreshJob,
  runStatsImportJob,
  startAdminReportingRefreshJob,
  runAiContentJob,
} from '../lib/background-jobs';

const DEFAULT_REPORTING_REFRESH_CRON = '11 3 * * *';
const DEFAULT_REPORTING_REFRESH_TIMEZONE = 'Africa/Algiers';

const workerDsn = process.env.SENTRY_DSN_WORKER?.trim() || process.env.SENTRY_DSN_ADMIN?.trim();

Sentry.init({
  dsn: workerDsn || undefined,
  enabled: Boolean(workerDsn),
  environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE?.trim() || undefined,
  tracesSampleRate: readSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE_WORKER, 0.1),
  initialScope: {
    tags: {
      service: 'worker',
    },
  },
});

const workers = [
  createQueueWorker(ADMIN_AI_CONTENT_QUEUE, runAiContentJob),
  createQueueWorker(ADMIN_PRODUCT_EXPORT_QUEUE, runProductExportJob),
  createQueueWorker(ADMIN_PRODUCT_CATALOG_FEED_QUEUE, runProductCatalogFeedRefreshJob),
  createQueueWorker(ADMIN_ORDER_EXPORT_QUEUE, runOrderExportJob),
  createQueueWorker(ADMIN_ORDER_ECOTRACK_QUEUE, runOrderEcotrackJob),
  createQueueWorker(ADMIN_STATS_IMPORT_QUEUE, runStatsImportJob),
  createQueueWorker(ADMIN_AD_COST_IMPORT_QUEUE, runAdCostsImportJob),
  createQueueWorker(ADMIN_REPORTING_REFRESH_QUEUE, runAdminReportingRefreshJob),
  createQueueWorker(ADMIN_ECOTRACK_SYNC_QUEUE, runEcotrackSyncJob),
  createQueueWorker(ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE, runEcotrackShipmentSyncJob),
  createQueueWorker(STOREFRONT_ANALYTICS_QUEUE, runAnalyticsJob),
];

const reportingRefreshCron = (process.env.ADMIN_REPORTING_REFRESH_CRON ?? DEFAULT_REPORTING_REFRESH_CRON).trim();
const reportingRefreshTimezone = (process.env.ADMIN_REPORTING_REFRESH_TIMEZONE ?? DEFAULT_REPORTING_REFRESH_TIMEZONE).trim();
if (!cron.validate(reportingRefreshCron)) {
  throw new Error(`Invalid ADMIN_REPORTING_REFRESH_CRON expression: ${reportingRefreshCron}`);
}

const reportingRefreshTask = cron.schedule(reportingRefreshCron, () => {
  void startAdminReportingRefreshJob('daily-schedule');
}, { timezone: reportingRefreshTimezone });

for (const worker of workers) {
  worker.on('ready', () => {
    console.log(`[worker] ready: ${worker.name}`);
  });

  worker.on('error', (error) => {
    Sentry.withScope((scope) => {
      scope.setTag('service', 'worker');
      scope.setTag('queue', worker.name);
      scope.setTag('worker_event', 'error');
      Sentry.captureException(error);
    });
  });

  worker.on('failed', (job, error) => {
    Sentry.withScope((scope) => {
      scope.setTag('service', 'worker');
      scope.setTag('queue', worker.name);
      scope.setTag('worker_event', 'failed');
      if (job?.id) {
        scope.setTag('job_id', job.id);
      }
      if (job?.name) {
        scope.setTag('job_name', job.name);
      }
      if (job?.attemptsMade !== undefined) {
        scope.setContext('job', {
          id: job.id ?? null,
          name: job.name ?? null,
          queue: worker.name,
          attemptsMade: job.attemptsMade,
        });
      }
      Sentry.captureException(error);
    });
  });
}

async function shutdown(signal: string) {
  console.log(`[worker] shutting down on ${signal}`);
  reportingRefreshTask.stop();
  await Promise.all(workers.map((worker) => worker.close()));
  await Sentry.close(2000);
  process.exit(0);
}

process.on('uncaughtException', (error) => {
  Sentry.captureException(error);
  void Sentry.flush(2000);
});

process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
  void Sentry.flush(2000);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
