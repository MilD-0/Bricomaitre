import * as Sentry from '@sentry/nextjs';
import cron from 'node-cron';

export const DEFAULT_ECOTRACK_SYNC_CRON = '17 2 * * *';
export const DEFAULT_ECOTRACK_SYNC_TIMEZONE = 'Africa/Algiers';
export const DEFAULT_ECOTRACK_SHIPMENT_SYNC_CRON = '*/15 * * * *';
export const DEFAULT_ECOTRACK_SHIPMENT_SYNC_TIMEZONE = 'Africa/Algiers';

type SchedulerState = {
  started: boolean;
  isRunning: boolean;
  task: ReturnType<typeof cron.schedule> | null;
  shipmentStarted: boolean;
  shipmentRunning: boolean;
  shipmentTask: ReturnType<typeof cron.schedule> | null;
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
      shipmentStarted: false,
      shipmentRunning: false,
      shipmentTask: null,
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

export async function runEcotrackShipmentSyncJob(trigger = 'schedule') {
  const state = getSchedulerState();

  if (state.shipmentRunning) {
    return false;
  }

  state.shipmentRunning = true;

  try {
    const { startEcotrackShipmentSyncJob } = await import('./background-jobs');
    const result = await startEcotrackShipmentSyncJob('scheduler', trigger);
    return result.kind === 'started' || result.kind === 'existing';
  } catch (error) {
    Sentry.withScope((scope) => {
      scope.setTag('service', 'admin');
      scope.setTag('operation', 'ecotrack-shipment-scheduler');
      scope.setContext('ecotrack_shipment_scheduler', { trigger });
      Sentry.captureException(error);
    });
    console.error('[ecotrack] scheduled shipment sync failed', error);
    return false;
  } finally {
    state.shipmentRunning = false;
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
  const shipmentExpression = (process.env.ECOTRACK_ORDER_SYNC_CRON ?? DEFAULT_ECOTRACK_SHIPMENT_SYNC_CRON).trim();
  const shipmentTimezone = (process.env.ECOTRACK_ORDER_SYNC_TIMEZONE ?? DEFAULT_ECOTRACK_SHIPMENT_SYNC_TIMEZONE).trim();

  state.task = cron.schedule(expression, () => {
    void runEcotrackSyncJob('schedule');
  }, { timezone });
  if (!cron.validate(shipmentExpression)) {
    throw new Error(`Invalid ECOTRACK_ORDER_SYNC_CRON expression: ${shipmentExpression}`);
  }
  state.shipmentTask = cron.schedule(shipmentExpression, () => {
    void runEcotrackShipmentSyncJob('schedule');
  }, { timezone: shipmentTimezone });
  state.started = true;
  state.shipmentStarted = true;

  return state.task;
}

export function resetEcotrackSchedulerForTests() {
  const state = getSchedulerState();
  state.task?.stop();
  state.shipmentTask?.stop();
  state.started = false;
  state.isRunning = false;
  state.task = null;
  state.shipmentStarted = false;
  state.shipmentRunning = false;
  state.shipmentTask = null;
}
