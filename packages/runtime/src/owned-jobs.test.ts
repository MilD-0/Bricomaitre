import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const transaction = {
    set: vi.fn(),
    zadd: vi.fn(),
    expire: vi.fn(),
    exec: vi.fn(),
  };
  transaction.set.mockReturnValue(transaction);
  transaction.zadd.mockReturnValue(transaction);
  transaction.expire.mockReturnValue(transaction);

  return {
    add: vi.fn(),
    getJob: vi.fn(),
    listeners: new Map<string, (...args: never[]) => unknown>(),
    redis: {
      eval: vi.fn(),
      exists: vi.fn(),
      get: vi.fn(),
      mget: vi.fn(),
      multi: vi.fn(() => transaction),
      set: vi.fn(),
    },
    transaction,
  };
});

vi.mock('bullmq', () => ({
  Job: class {},
  Queue: class {
    add = mocks.add;
    getJob = mocks.getJob;
  },
  QueueEvents: class {},
  UnrecoverableError: class UnrecoverableError extends Error {},
  Worker: class {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    on(event: string, listener: (...args: never[]) => unknown) {
      mocks.listeners.set(event, listener);
    }
  },
}));

vi.mock('./redis', () => ({
  getBullRedisConnection: vi.fn(() => ({})),
  getRedis: () => mocks.redis,
}));

import {
  createQueueWorker,
  markJobCompleted,
  requestJobCancellationById,
  startOwnedJob,
  throwIfJobCancelled,
  type JobSnapshot,
} from './jobs';

const snapshot: JobSnapshot = {
  id: 'job-1',
  queue: 'owned-jobs-test',
  kind: 'test-job',
  ownerKey: 'operator@example.com',
  origin: 'admin-ai-assistant',
  status: 'running',
  progress: { phase: 'working', current: 1, total: 2, percentage: 50 },
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:01.000Z',
  completedAt: null,
  errorMessage: null,
  downloadUrl: null,
  resultSummary: null,
  cancelRequested: false,
};

describe('owned runtime jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listeners.clear();
    mocks.transaction.set.mockReturnValue(mocks.transaction);
    mocks.transaction.zadd.mockReturnValue(mocks.transaction);
    mocks.transaction.expire.mockReturnValue(mocks.transaction);
    mocks.transaction.exec.mockResolvedValue([]);
    mocks.redis.eval.mockResolvedValue('OK');
    mocks.redis.exists.mockResolvedValue(0);
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.set.mockResolvedValue('OK');
    mocks.add.mockResolvedValue({ id: 'queued' });
  });

  it('does not retry owned work unless the caller explicitly opts in', async () => {
    await startOwnedJob({
      queueName: 'owned-jobs-default-attempts',
      kind: 'test-job',
      ownerKey: 'operator@example.com',
      data: {},
    });
    expect(mocks.add).toHaveBeenLastCalledWith(
      'test-job',
      expect.any(Object),
      expect.objectContaining({ attempts: 1 }),
    );

    await startOwnedJob({
      queueName: 'owned-jobs-opt-in-attempts',
      kind: 'test-job',
      ownerKey: 'operator@example.com',
      data: {},
      queueOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1_000 } },
    });
    expect(mocks.add).toHaveBeenLastCalledWith(
      'test-job',
      expect.any(Object),
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('stores cancellation independently and stops it without a retryable error', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify(snapshot));

    await requestJobCancellationById(snapshot.queue, snapshot.id);

    expect(mocks.redis.set).toHaveBeenCalledWith(
      `bric:jobs:${snapshot.queue}:${snapshot.id}:cancel`,
      '1',
      'EX',
      86_400,
    );

    mocks.redis.exists.mockResolvedValue(1);
    await expect(throwIfJobCancelled(snapshot.queue, snapshot.id)).rejects.toMatchObject({
      name: 'Error',
      message: 'Job cancelled.',
    });
  });

  it('does not misreport completed work when cancellation arrives too late', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify({ ...snapshot, cancelRequested: true }));

    await markJobCompleted(snapshot.queue, snapshot.id, { resultSummary: { complete: true } });

    expect(mocks.redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('cjson.decode'),
      5,
      expect.any(String),
      expect.stringMatching(/:cancel$/),
      expect.stringContaining(':owner:'),
      expect.stringMatching(/:index$/),
      expect.stringMatching(/:index$/),
      expect.stringMatching(/"status":"completed"/),
      86_400,
      expect.any(Number),
      '1',
    );
  });

  it('keeps an older job update from replacing the latest owner pointer', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify(snapshot));

    await markJobCompleted(snapshot.queue, snapshot.id);

    expect(mocks.redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('zscore'"),
      5,
      expect.any(String),
      expect.stringMatching(/:cancel$/),
      `bric:jobs:${snapshot.queue}:owner:${snapshot.ownerKey}`,
      `bric:jobs:${snapshot.queue}:index`,
      expect.any(String),
      expect.any(String),
      86_400,
      Date.parse(snapshot.createdAt),
      '1',
    );
  });

  it('releases an active slot only when the completing job still owns it', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify(snapshot));
    createQueueWorker(snapshot.queue, async () => undefined);
    const completed = mocks.listeners.get('completed');

    await completed?.({
      id: snapshot.id,
      data: { __jobMeta: { activeScope: 'owner', ownerKey: snapshot.ownerKey } },
    } as never);

    expect(mocks.redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get'"),
      1,
      `bric:jobs:${snapshot.queue}:active:${snapshot.ownerKey}`,
      snapshot.id,
    );
  });
});
