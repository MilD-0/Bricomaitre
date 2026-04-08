import { beforeEach, describe, expect, it, vi } from 'vitest';

const { scheduleMock, validateMock, startEcotrackSyncJobMock, startEcotrackShipmentSyncJobMock } = vi.hoisted(() => ({
  scheduleMock: vi.fn(),
  validateMock: vi.fn(),
  startEcotrackSyncJobMock: vi.fn(),
  startEcotrackShipmentSyncJobMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: {
    schedule: scheduleMock,
    validate: validateMock,
  },
}));

vi.mock('./background-jobs', () => ({
  startEcotrackSyncJob: startEcotrackSyncJobMock,
  startEcotrackShipmentSyncJob: startEcotrackShipmentSyncJobMock,
}));

describe('lib/ecotrack-scheduler', () => {
  beforeEach(async () => {
    vi.resetModules();
    scheduleMock.mockReset();
    validateMock.mockReset();
    startEcotrackSyncJobMock.mockReset();
    startEcotrackShipmentSyncJobMock.mockReset();

    validateMock.mockReturnValue(true);
    scheduleMock.mockReturnValue({ stop: vi.fn() });
    startEcotrackSyncJobMock.mockResolvedValue({ kind: 'started', job: { id: 'job-1', status: 'queued' } });
    startEcotrackShipmentSyncJobMock.mockResolvedValue({ kind: 'started', job: { id: 'job-2', status: 'queued' } });

    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.ECOTRACK_SYNC_CRON;
    delete process.env.ECOTRACK_SYNC_TIMEZONE;
  });

  it('registers the scheduler only once', async () => {
    const {
      resetEcotrackSchedulerForTests,
      startEcotrackScheduler,
      DEFAULT_ECOTRACK_SYNC_CRON,
      DEFAULT_ECOTRACK_SHIPMENT_SYNC_CRON,
    } = await import('./ecotrack-scheduler');

    resetEcotrackSchedulerForTests();
    startEcotrackScheduler();
    startEcotrackScheduler();

    expect(validateMock).toHaveBeenCalledWith(DEFAULT_ECOTRACK_SYNC_CRON);
    expect(validateMock).toHaveBeenCalledWith(DEFAULT_ECOTRACK_SHIPMENT_SYNC_CRON);
    expect(scheduleMock).toHaveBeenCalledTimes(2);
  });

  it('runs the sync job when the scheduler entrypoint is invoked', async () => {
    const { resetEcotrackSchedulerForTests, runEcotrackSyncJob, startEcotrackScheduler } = await import('./ecotrack-scheduler');

    resetEcotrackSchedulerForTests();
    startEcotrackScheduler();

    const scheduledCallback = scheduleMock.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    expect(scheduledCallback).toBeTypeOf('function');

    await expect(runEcotrackSyncJob('schedule')).resolves.toBe(true);
    expect(startEcotrackSyncJobMock).toHaveBeenCalledWith('scheduler', 'schedule');
  });

  it('returns false when queue start fails', async () => {
    const { runEcotrackSyncJob, resetEcotrackSchedulerForTests } = await import('./ecotrack-scheduler');

    resetEcotrackSchedulerForTests();
    startEcotrackSyncJobMock.mockRejectedValue(new Error('queue offline'));

    await expect(runEcotrackSyncJob()).resolves.toBe(false);
    expect(startEcotrackSyncJobMock).toHaveBeenCalled();
  });
});
