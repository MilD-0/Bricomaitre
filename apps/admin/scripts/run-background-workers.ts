import 'dotenv/config';

import * as Sentry from '@sentry/node';
import {
  createLightweightQueueWorker,
  createQueueWorker,
  isJobCancellationError,
} from '@bric/runtime/jobs';
import { writeWorkerHeartbeat } from '@bric/runtime/worker-heartbeat';
import cron from 'node-cron';

import { readSampleRate } from '../lib/sentry';
import {
  ANALYTICS_SNAPSHOT_QUEUE,
  getAnalyticsSnapshot,
  warmAnalyticsSnapshots,
} from '../lib/analytics-snapshots';
import type { AnalyticsQuery } from '../lib/analytics';
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
  ADMIN_AI_CONTENT_QUEUE,
  ADMIN_AI_CATEGORIZATION_QUEUE,
  ADMIN_AI_LANDING_PAGE_QUEUE,
  runAdCostsImportJob,
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
  runAiCategorizationJob,
  runAiLandingPageJob,
  getBackgroundJob,
} from '../lib/background-jobs';
import { publishAiTaskTerminalMessage } from '../lib/ai-task-followups';
import {
  attachAiTaskTerminalFollowups,
  type AiTaskLifecycleWorker,
} from '../lib/ai-task-terminal-lifecycle';
import { runDatabaseMaintenance } from '../lib/database-maintenance';
import { startEcotrackScheduler, stopEcotrackScheduler } from '../lib/ecotrack-scheduler';
import { startMetaAdsScheduler, stopMetaAdsScheduler } from '../lib/meta-ads-scheduler';
import {
  startSearchConsoleScheduler,
  stopSearchConsoleScheduler,
} from '../lib/search-console-scheduler';

const DEFAULT_REPORTING_REFRESH_CRON = '11 3 * * *';
const DEFAULT_REPORTING_REFRESH_TIMEZONE = 'Africa/Algiers';
const DEFAULT_DATABASE_MAINTENANCE_CRON = '43 * * * *';
const DEFAULT_DATABASE_MAINTENANCE_TIMEZONE = 'Africa/Algiers';
const WORKER_HEARTBEAT_PATH = '/tmp/bric-admin-worker-heartbeat';
const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;

if (process.env.ADMIN_WORKER_BOOTSTRAP_CHECK === '1') {
  console.log('[worker] bootstrap check passed');
  process.exit(0);
}

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

startEcotrackScheduler();
startMetaAdsScheduler();
startSearchConsoleScheduler();

const workers = [
  createQueueWorker(ADMIN_AI_CATEGORIZATION_QUEUE, runAiCategorizationJob),
  createQueueWorker(ADMIN_AI_CONTENT_QUEUE, runAiContentJob),
  createQueueWorker(ADMIN_AI_LANDING_PAGE_QUEUE, runAiLandingPageJob),
  createQueueWorker(ADMIN_PRODUCT_EXPORT_QUEUE, runProductExportJob),
  createQueueWorker(ADMIN_PRODUCT_CATALOG_FEED_QUEUE, runProductCatalogFeedRefreshJob),
  createQueueWorker(ADMIN_ORDER_EXPORT_QUEUE, runOrderExportJob),
  createQueueWorker(ADMIN_ORDER_ECOTRACK_QUEUE, runOrderEcotrackJob),
  createQueueWorker(ADMIN_STATS_IMPORT_QUEUE, runStatsImportJob),
  createQueueWorker(ADMIN_AD_COST_IMPORT_QUEUE, runAdCostsImportJob),
  createQueueWorker(ADMIN_REPORTING_REFRESH_QUEUE, runAdminReportingRefreshJob),
  createQueueWorker(ADMIN_ECOTRACK_SYNC_QUEUE, runEcotrackSyncJob),
  createQueueWorker(ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE, runEcotrackShipmentSyncJob),
];

const analyticsWorker = createLightweightQueueWorker<AnalyticsQuery>(
  ANALYTICS_SNAPSHOT_QUEUE,
  async (query) => {
    await getAnalyticsSnapshot(query, { refresh: true, remember: false });
  },
  { concurrency: 1 },
);
analyticsWorker.on('error', (error) => {
  console.error('[analytics] Snapshot worker error', error);
  Sentry.captureException(error);
});
let warmingAnalytics = false;
async function warmAnalytics() {
  if (stopping || warmingAnalytics) return;
  warmingAnalytics = true;
  try {
    await warmAnalyticsSnapshots();
  } catch (error) {
    Sentry.captureException(error);
    console.error('[worker] analytics warm-up failed', error);
  } finally {
    warmingAnalytics = false;
  }
}
const analyticsWarmTimer = setInterval(() => void warmAnalytics(), 15 * 60_000);
analyticsWarmTimer.unref();

let stopping = false;
let heartbeatRunning = false;
void warmAnalytics();

async function refreshWorkerHeartbeat() {
  if (stopping || heartbeatRunning) return;

  heartbeatRunning = true;
  try {
    await Promise.all([...workers, analyticsWorker].map((worker) => worker.waitUntilReady()));
    await writeWorkerHeartbeat(WORKER_HEARTBEAT_PATH);
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: 'worker-heartbeat' } });
  } finally {
    heartbeatRunning = false;
  }
}

const heartbeatTimer = setInterval(() => {
  void refreshWorkerHeartbeat();
}, WORKER_HEARTBEAT_INTERVAL_MS);
heartbeatTimer.unref();
void refreshWorkerHeartbeat();

for (const rawWorker of workers) {
  const worker = rawWorker as unknown as AiTaskLifecycleWorker;
  attachAiTaskTerminalFollowups(worker, {
    getSnapshot: getBackgroundJob,
    publish: publishAiTaskTerminalMessage,
    onError: (error, event) => {
      Sentry.captureException(error);
      console.error(`[worker] failed to publish AI task ${event}`, error);
    },
  });
}

const reportingRefreshCron = (
  process.env.ADMIN_REPORTING_REFRESH_CRON ?? DEFAULT_REPORTING_REFRESH_CRON
).trim();
const reportingRefreshTimezone = (
  process.env.ADMIN_REPORTING_REFRESH_TIMEZONE ?? DEFAULT_REPORTING_REFRESH_TIMEZONE
).trim();
if (!cron.validate(reportingRefreshCron)) {
  throw new Error(`Invalid ADMIN_REPORTING_REFRESH_CRON expression: ${reportingRefreshCron}`);
}

const reportingRefreshTask = cron.schedule(
  reportingRefreshCron,
  () => {
    void startAdminReportingRefreshJob('daily-schedule');
  },
  { timezone: reportingRefreshTimezone },
);

const databaseMaintenanceCron = (
  process.env.ADMIN_DATABASE_MAINTENANCE_CRON ?? DEFAULT_DATABASE_MAINTENANCE_CRON
).trim();
const databaseMaintenanceTimezone = (
  process.env.ADMIN_DATABASE_MAINTENANCE_TIMEZONE ?? DEFAULT_DATABASE_MAINTENANCE_TIMEZONE
).trim();
if (!cron.validate(databaseMaintenanceCron)) {
  throw new Error(`Invalid ADMIN_DATABASE_MAINTENANCE_CRON expression: ${databaseMaintenanceCron}`);
}

let databaseMaintenanceRunning = false;
const databaseMaintenanceTask = cron.schedule(
  databaseMaintenanceCron,
  () => {
    if (databaseMaintenanceRunning) {
      return;
    }

    databaseMaintenanceRunning = true;
    void runDatabaseMaintenance()
      .then((summary) => console.log('[worker] database maintenance complete', summary))
      .catch((error) => {
        Sentry.withScope((scope) => {
          scope.setTag('service', 'worker');
          scope.setTag('operation', 'database-maintenance');
          Sentry.captureException(error);
        });
        console.error('[worker] database maintenance failed', error);
      })
      .finally(() => {
        databaseMaintenanceRunning = false;
      });
  },
  { timezone: databaseMaintenanceTimezone },
);

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
    if (isJobCancellationError(error)) return;
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

async function shutdown(signal: string, exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] shutting down on ${signal}`);
  clearInterval(heartbeatTimer);
  clearInterval(analyticsWarmTimer);
  reportingRefreshTask.stop();
  databaseMaintenanceTask.stop();
  stopEcotrackScheduler();
  stopMetaAdsScheduler();
  stopSearchConsoleScheduler();
  await Promise.all([...workers, analyticsWorker].map((worker) => worker.close()));
  await Sentry.close(2000);
  process.exit(exitCode);
}

process.on('uncaughtException', (error) => {
  Sentry.captureException(error);
  void shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
  Sentry.captureException(reason);
  void shutdown('unhandledRejection', 1);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
