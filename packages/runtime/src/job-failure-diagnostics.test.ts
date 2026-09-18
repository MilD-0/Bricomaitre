import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<void>>(),
  snapshot: vi.fn(),
  markFailed: vi.fn(),
  capture: vi.fn(),
  context: vi.fn(),
}));
vi.mock('bullmq', () => ({
  Worker: class {
    on(name: string, handler: (...args: unknown[]) => Promise<void>) {
      mocks.handlers.set(name, handler);
    }
  },
}));
vi.mock('./redis', () => ({ getBullRedisConnection: () => ({}), getRedis: () => ({}) }));
vi.mock('./jobs/snapshots', () => ({ getJobSnapshot: mocks.snapshot }));
vi.mock('./jobs/progress', () => ({
  isFinalJobAttempt: () => true,
  isJobCancellationError: () => false,
  markJobFailed: mocks.markFailed,
}));
vi.mock('@sentry/node', () => ({
  withScope: (run: (scope: unknown) => void) => run({ setTag: vi.fn(), setContext: mocks.context }),
  captureException: mocks.capture,
}));
import { createQueueWorker } from './jobs/queues';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.handlers.clear();
});

it('attaches saved diagnostics when a terminal job fails without returning a result', async () => {
  const diagnostics = { total: 100, failed: 100, failures: [{ stage: 'status', status: 503 }] };
  mocks.snapshot.mockResolvedValue({ resultSummary: { diagnostics } });
  createQueueWorker('test-sync', vi.fn());
  const error = new Error('all candidates failed');
  await mocks.handlers.get('failed')!(
    { id: 'job-1', name: 'sync', data: {}, attemptsMade: 1 },
    error,
  );
  expect(mocks.context).toHaveBeenCalledWith('job_diagnostics', diagnostics);
  expect(mocks.capture).toHaveBeenCalledWith(error);
  expect(mocks.markFailed).toHaveBeenCalledWith('test-sync', 'job-1', error.message);
});

it('still reports the original failure when its saved diagnostics cannot be read', async () => {
  mocks.snapshot.mockRejectedValueOnce(new Error('Redis unavailable')).mockResolvedValue(null);
  createQueueWorker('test-sync', vi.fn());
  const error = new Error('all candidates failed');
  await mocks.handlers.get('failed')!(
    { id: 'job-2', name: 'sync', data: {}, attemptsMade: 1 },
    error,
  );
  expect(mocks.capture).toHaveBeenCalledWith(error);
  expect(mocks.markFailed).toHaveBeenCalled();
});
