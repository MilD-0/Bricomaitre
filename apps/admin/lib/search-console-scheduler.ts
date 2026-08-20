import * as Sentry from '@sentry/node';
import cron from 'node-cron';

import { readSearchConsoleConfig, syncSearchConsole } from './search-console';

export const DEFAULT_SEARCH_CONSOLE_SYNC_CRON = '37 4 * * *';
const DEFAULT_SEARCH_CONSOLE_SYNC_TIMEZONE = 'Africa/Algiers';

type SchedulerState = {
  started: boolean;
  running: boolean;
  task: ReturnType<typeof cron.schedule> | null;
};

const schedulerGlobal = globalThis as typeof globalThis & {
  __searchConsoleSchedulerState?: SchedulerState;
};

function state() {
  if (!schedulerGlobal.__searchConsoleSchedulerState) {
    schedulerGlobal.__searchConsoleSchedulerState = { started: false, running: false, task: null };
  }
  return schedulerGlobal.__searchConsoleSchedulerState;
}

function isEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.ADMIN_SEARCH_CONSOLE_SYNC_ENABLED?.trim().toLowerCase() === 'true';
}

export async function runScheduledSearchConsoleSync(trigger = 'schedule') {
  const current = state();
  if (current.running) return false;
  current.running = true;
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
    current.running = false;
  }
}

export function startSearchConsoleScheduler() {
  if (process.env.NODE_ENV === 'test' || !isEnabled()) return null;
  readSearchConsoleConfig();
  const current = state();
  if (current.started) return current.task;
  const expression = (
    process.env.ADMIN_SEARCH_CONSOLE_SYNC_CRON ?? DEFAULT_SEARCH_CONSOLE_SYNC_CRON
  ).trim();
  if (!cron.validate(expression)) {
    throw new Error(`Invalid ADMIN_SEARCH_CONSOLE_SYNC_CRON expression: ${expression}`);
  }
  const timezone = (
    process.env.ADMIN_SEARCH_CONSOLE_SYNC_TIMEZONE ?? DEFAULT_SEARCH_CONSOLE_SYNC_TIMEZONE
  ).trim();
  current.task = cron.schedule(expression, () => void runScheduledSearchConsoleSync('schedule'), {
    timezone,
  });
  current.started = true;
  void runScheduledSearchConsoleSync('startup');
  return current.task;
}

export function stopSearchConsoleScheduler() {
  const current = state();
  current.task?.stop();
  current.started = false;
  current.running = false;
  current.task = null;
}

export function resetSearchConsoleSchedulerForTests() {
  stopSearchConsoleScheduler();
}
