import * as Sentry from '@sentry/node';
import { getDb } from '@bric/db/client';
import { syncEcotrackShipmentStates } from '../admin-ecotrack-orders-data';
import { refreshAnalyticsFacts } from '../analytics-facts';
import {
  type EcotrackShipmentSyncPayload,
  type EcotrackSyncPayload,
  type OrderEcotrackPayload,
} from '../background-job-contract';
import {
  loadEcotrackOrderInputs,
  postOrdersToEcotrack,
  readEcotrackCatalog,
  syncEcotrackCatalog,
} from '../ecotrack';
import { getReportingDb } from '../reporting-db';

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
    job?: { id?: string };
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  },
) {
  const result = await syncEcotrackShipmentStates({
    actor: payload.actor,
    onSummary: async (result) => {
      const summary = { trigger: payload.trigger, ...result, diagnostics: result };
      if (Number(result.failureCount) > 0) {
        const jobId = helpers.job?.id ?? null;
        console.warn(
          '[ecotrack-shipment-sync] failures',
          JSON.stringify({
            jobId,
            release: process.env.SENTRY_RELEASE ?? null,
            trigger: payload.trigger,
            ...result,
          }),
        );
        // Total failures are captured by the queue worker with this saved summary.
        if (
          Number(result.synced) +
            Number(result.missing) +
            Number(result.retired) +
            Number(result.superseded) >
          0
        ) {
          Sentry.withScope((scope) => {
            scope.setTag('queue', 'admin-ecotrack-shipment-sync');
            scope.setTag('job_name', 'ecotrack-shipment-sync');
            if (jobId) scope.setTag('job_id', jobId);
            scope.setContext('ecotrack_sync', summary);
            scope.setFingerprint(['ecotrack-shipment-sync', 'partial-failure']);
            Sentry.captureMessage('ECOTRACK shipment sync partially failed', 'warning');
          });
        }
      }
      await helpers.updateSummary(summary);
    },
  });
  await refreshAnalyticsFacts({ db: getReportingDb() });
  const summary = {
    trigger: payload.trigger,
    ...result,
  };
  await helpers.updateSummary(summary);
  return summary;
}
