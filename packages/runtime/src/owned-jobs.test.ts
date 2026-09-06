import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ add: vi.fn(), eval: vi.fn() }));
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Queue: class {
      add = mocks.add;
    },
  };
});
vi.mock('./redis', () => ({
  getBullRedisConnection: () => ({}),
  getRedis: () => ({ eval: mocks.eval }),
}));

import { UnrecoverableError } from 'bullmq';
import { isFinalJobAttempt, startOwnedJob } from './jobs';

describe('owned job policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eval.mockImplementation((_script, keyCount, ...args) => args[keyCount]);
    mocks.add.mockResolvedValue({ id: 'queued' });
  });

  it('defaults side-effecting jobs to one attempt while retaining explicit retry policy', async () => {
    await startOwnedJob({
      queueName: 'single-attempt',
      kind: 'test',
      ownerKey: 'operator',
      data: {},
    });
    expect(mocks.add).toHaveBeenLastCalledWith(
      'test',
      expect.any(Object),
      expect.objectContaining({ attempts: 1 }),
    );
    await startOwnedJob({
      queueName: 'explicit-retry',
      kind: 'test',
      ownerKey: 'operator',
      data: {},
      queueOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    });
    expect(mocks.add).toHaveBeenLastCalledWith(
      'test',
      expect.any(Object),
      expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 1000 } }),
    );
  });

  it('treats unrecoverable failure as terminal on the first configured attempt', () => {
    const job = { attemptsMade: 1, opts: { attempts: 3 } };
    expect(isFinalJobAttempt(job, new Error('transient'))).toBe(false);
    expect(isFinalJobAttempt(job, new UnrecoverableError('Job cancelled.'))).toBe(true);
    expect(isFinalJobAttempt({ ...job, attemptsMade: 3 }, new Error('failed'))).toBe(true);
  });
});
