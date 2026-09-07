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
