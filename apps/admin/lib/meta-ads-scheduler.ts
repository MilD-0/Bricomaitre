import * as Sentry from '@sentry/node';
import cron from 'node-cron';

import { readMetaAdsConfig, syncMetaAdsInsights } from './meta-ads-insights';

export const DEFAULT_META_ADS_SYNC_CRON = '17 */6 * * *';
const DEFAULT_META_ADS_SYNC_TIMEZONE = 'Africa/Algiers';

let running = false;
let task: ReturnType<typeof cron.schedule> | null = null;

export async function runScheduledMetaAdsSync(trigger = 'schedule') {
  if (running) return false;
  running = true;

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
    running = false;
  }
}

export function startMetaAdsScheduler() {
  if (process.env.ADMIN_META_ADS_SYNC_ENABLED?.trim().toLowerCase() !== 'true') return null;
  readMetaAdsConfig();
  if (task) return task;

  const expression = (process.env.ADMIN_META_ADS_SYNC_CRON ?? DEFAULT_META_ADS_SYNC_CRON).trim();
  if (!cron.validate(expression)) {
    throw new Error(`Invalid ADMIN_META_ADS_SYNC_CRON expression: ${expression}`);
  }
  const timezone = (
    process.env.ADMIN_META_ADS_SYNC_TIMEZONE ?? DEFAULT_META_ADS_SYNC_TIMEZONE
  ).trim();
  task = cron.schedule(expression, () => void runScheduledMetaAdsSync('schedule'), {
    timezone,
  });
  void runScheduledMetaAdsSync('startup');
  return task;
}

export function stopMetaAdsScheduler() {
  void task?.destroy();
  task = null;
}
