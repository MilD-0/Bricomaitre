import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  sync: vi.fn(),
  refresh: vi.fn(),
  capture: vi.fn(),
  tag: vi.fn(),
  context: vi.fn(),
  fingerprint: vi.fn(),
}));
vi.mock('@bric/db/client', () => ({ getDb: () => ({}) }));
vi.mock('../admin-ecotrack-orders-data', () => ({ syncEcotrackShipmentStates: mocks.sync }));
vi.mock('../analytics-facts', () => ({ refreshAnalyticsFacts: mocks.refresh }));
vi.mock('../reporting-db', () => ({ getReportingDb: () => ({}) }));
vi.mock('../ecotrack', () => ({}));
vi.mock('@sentry/node', () => ({
  withScope: (run: (scope: unknown) => void) =>
    run({ setTag: mocks.tag, setContext: mocks.context, setFingerprint: mocks.fingerprint }),
  captureMessage: mocks.capture,
}));
import { runEcotrackShipmentSyncJob } from './carrier';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
const failure = { stage: 'persist', provider: 'delivro', orderIds: [15], code: '21000' };
const result = {
  total: 2,
  synced: 1,
  missing: 0,
  retired: 0,
  superseded: 0,
  failed: 1,
  failureCount: 1,
  failures: [failure],
};
it('saves and reports partial failures with the owning job ID', async () => {
  mocks.sync.mockImplementation(async ({ onSummary }) => {
    await onSummary(result);
    return result;
  });
  const updateSummary = vi.fn().mockResolvedValue(undefined);
  await runEcotrackShipmentSyncJob(
    {
      trigger: 'schedule',
      __jobMeta: {
        id: 'test',
        ownerKey: 'schedule',
        queueName: 'admin-ecotrack-shipment-sync',
        activeScope: 'global',
      },
    },
    { job: { id: 'job-123' }, updateSummary },
  );
  expect(updateSummary).toHaveBeenCalledWith(expect.objectContaining({ diagnostics: result }));
  expect(mocks.tag).toHaveBeenCalledWith('job_id', 'job-123');
  expect(mocks.context).toHaveBeenCalledWith(
    'ecotrack_sync',
    expect.objectContaining({ failures: [failure] }),
  );
  expect(mocks.capture).toHaveBeenCalledWith('ECOTRACK shipment sync partially failed', 'warning');
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it('persists diagnostics before a total failure reaches queue error reporting', async () => {
  const totalFailure = { ...result, synced: 0, failed: 2 };
  mocks.sync.mockImplementation(async ({ onSummary }) => {
    await onSummary(totalFailure);
    throw new Error('all candidates failed');
  });
  const updateSummary = vi.fn().mockResolvedValue(undefined);
  await expect(
    runEcotrackShipmentSyncJob(
      {
        trigger: 'schedule',
        __jobMeta: {
          id: 'test',
          ownerKey: 'schedule',
          queueName: 'admin-ecotrack-shipment-sync',
          activeScope: 'global',
        },
      },
      { job: { id: 'job-456' }, updateSummary },
    ),
  ).rejects.toThrow('all candidates failed');
  expect(updateSummary).toHaveBeenCalledWith(
    expect.objectContaining({ diagnostics: totalFailure }),
  );
  expect(mocks.capture).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
