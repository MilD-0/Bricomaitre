import * as Sentry from '@sentry/node';
import cron from 'node-cron';

import { readSearchConsoleConfig, syncSearchConsole } from './search-console';

const DEFAULT_SEARCH_CONSOLE_SYNC_CRON = '37 4 * * *';
const DEFAULT_SEARCH_CONSOLE_SYNC_TIMEZONE = 'Africa/Algiers';

let running = false;
let task: ReturnType<typeof cron.schedule> | null = null;

export async function runScheduledSearchConsoleSync(trigger = 'schedule') {
  if (running) return false;
  running = true;
  try {
    await syncSearchConsole({ trigger });
    return true;
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag('service', 'admin-worker');
      scope.setTag('operation', 'search-console-sync');
      scope.setContext('search_console_sync', { trigger });
      Sentry.captureException(error);
    });
    console.error('[search-console] scheduled sync failed', error);
    return false;
  } finally {
    running = false;
  }
}

export function startSearchConsoleScheduler() {
  if (process.env.ADMIN_SEARCH_CONSOLE_SYNC_ENABLED?.trim().toLowerCase() !== 'true') return null;
  readSearchConsoleConfig();
  if (task) return task;
  const expression = (
    process.env.ADMIN_SEARCH_CONSOLE_SYNC_CRON ?? DEFAULT_SEARCH_CONSOLE_SYNC_CRON
  ).trim();
  if (!cron.validate(expression)) {
    throw new Error(`Invalid ADMIN_SEARCH_CONSOLE_SYNC_CRON expression: ${expression}`);
  }
  const timezone = (
    process.env.ADMIN_SEARCH_CONSOLE_SYNC_TIMEZONE ?? DEFAULT_SEARCH_CONSOLE_SYNC_TIMEZONE
  ).trim();
  task = cron.schedule(expression, () => void runScheduledSearchConsoleSync('schedule'), {
    timezone,
  });
  void runScheduledSearchConsoleSync('startup');
  return task;
}

export function stopSearchConsoleScheduler() {
  void task?.destroy();
  task = null;
}
