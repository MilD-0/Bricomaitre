import * as Sentry from '@sentry/node';
import cron from 'node-cron';

import { readMetaAdsConfig, syncMetaAdsInsights } from './meta-ads-insights';

export const DEFAULT_META_ADS_SYNC_CRON = '17 */6 * * *';
const DEFAULT_META_ADS_SYNC_TIMEZONE = 'Africa/Algiers';

type SchedulerState = {
  started: boolean;
  running: boolean;
  task: ReturnType<typeof cron.schedule> | null;
};

const schedulerGlobal = globalThis as typeof globalThis & {
  __metaAdsSchedulerState?: SchedulerState;
};

function state() {
  if (!schedulerGlobal.__metaAdsSchedulerState) {
    schedulerGlobal.__metaAdsSchedulerState = { started: false, running: false, task: null };
  }
  return schedulerGlobal.__metaAdsSchedulerState;
}

function isMetaAdsSyncEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.ADMIN_META_ADS_SYNC_ENABLED?.trim().toLowerCase() === 'true';
}

export async function runScheduledMetaAdsSync(trigger = 'schedule') {
  const current = state();
  if (current.running) return false;
  current.running = true;

  try {
    await syncMetaAdsInsights({ trigger });
    return true;
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag('service', 'admin-worker');
      scope.setTag('operation', 'meta-ads-sync');
      scope.setContext('meta_ads_sync', { trigger });
      Sentry.captureException(error);
    });
    console.error('[meta-ads] scheduled insights sync failed', error);
    return false;
  } finally {
    current.running = false;
  }
}

export function startMetaAdsScheduler() {
  if (process.env.NODE_ENV === 'test' || !isMetaAdsSyncEnabled()) return null;
  readMetaAdsConfig();
  const current = state();
  if (current.started) return current.task;

  const expression = (process.env.ADMIN_META_ADS_SYNC_CRON ?? DEFAULT_META_ADS_SYNC_CRON).trim();
  if (!cron.validate(expression)) {
    throw new Error(`Invalid ADMIN_META_ADS_SYNC_CRON expression: ${expression}`);
  }
  const timezone = (
    process.env.ADMIN_META_ADS_SYNC_TIMEZONE ?? DEFAULT_META_ADS_SYNC_TIMEZONE
  ).trim();
  current.task = cron.schedule(expression, () => void runScheduledMetaAdsSync('schedule'), {
    timezone,
  });
  current.started = true;
  void runScheduledMetaAdsSync('startup');
  return current.task;
}

export function stopMetaAdsScheduler() {
  const current = state();
  current.task?.stop();
  current.started = false;
  current.running = false;
  current.task = null;
}

export function resetMetaAdsSchedulerForTests() {
  stopMetaAdsScheduler();
}
