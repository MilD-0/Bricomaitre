import * as Sentry from '@sentry/nextjs';
import cron from 'node-cron';

export const DEFAULT_ECOTRACK_SYNC_CRON = '17 2 * * *';
export const DEFAULT_ECOTRACK_SYNC_TIMEZONE = 'Africa/Algiers';

type SchedulerState = {
  started: boolean;
  isRunning: boolean;
  task: ReturnType<typeof cron.schedule> | null;
};

const schedulerGlobal = globalThis as typeof globalThis & {
  __ecotrackSchedulerState?: SchedulerState;
};

function getSchedulerState() {
  if (!schedulerGlobal.__ecotrackSchedulerState) {
    schedulerGlobal.__ecotrackSchedulerState = {
      started: false,
      isRunning: false,
      task: null,
    };
  }

  return schedulerGlobal.__ecotrackSchedulerState;
}

export async function runEcotrackSyncJob(trigger = 'schedule') {
  const state = getSchedulerState();

  if (state.isRunning) {
    return false;
  }

  state.isRunning = true;

  try {
    const { startEcotrackSyncJob } = await import('./background-jobs');
    const result = await startEcotrackSyncJob('scheduler', trigger);
    return result.kind === 'started' || result.kind === 'existing';
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag('service', 'admin');
      scope.setTag('operation', 'ecotrack-scheduler');
      scope.setContext('ecotrack_scheduler', { trigger });
      Sentry.captureException(error);
    });
    console.error('[ecotrack] scheduled sync failed', error);
    return false;
  } finally {
    state.isRunning = false;
  }
}

export function startEcotrackScheduler() {
  if (process.env.NODE_ENV === 'test') {
    return null;
  }

  const state = getSchedulerState();

  if (state.started) {
    return state.task;
  }

  const expression = (process.env.ECOTRACK_SYNC_CRON ?? DEFAULT_ECOTRACK_SYNC_CRON).trim();

  if (!cron.validate(expression)) {
    throw new Error(`Invalid ECOTRACK_SYNC_CRON expression: ${expression}`);
  }

  const timezone = (process.env.ECOTRACK_SYNC_TIMEZONE ?? DEFAULT_ECOTRACK_SYNC_TIMEZONE).trim();

  state.task = cron.schedule(expression, () => {
    void runEcotrackSyncJob('schedule');
  }, { timezone });
  state.started = true;

  return state.task;
}

export function resetEcotrackSchedulerForTests() {
  const state = getSchedulerState();
  state.task?.stop();
  state.started = false;
  state.isRunning = false;
  state.task = null;
}
