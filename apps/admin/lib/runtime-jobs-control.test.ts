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
    redis: {
      get: vi.fn(),
      set: vi.fn(),
      eval: vi.fn(),
      exists: vi.fn(),
      zrevrange: vi.fn(),
      scan: vi.fn(),
      mget: vi.fn(),
      multi: vi.fn(() => transaction),
    },
    transaction,
  };
});

vi.mock('@bric/runtime/redis', () => ({
  getRedis: () => mocks.redis,
  getBullRedisConnection: vi.fn(),
}));

import {
  isFinalJobAttempt,
  listRecentJobSnapshots,
  requestJobCancellationById,
  startOwnedJob,
  type JobSnapshot,
} from '@bric/runtime/jobs';

const snapshot: JobSnapshot = {
  id: 'job-1',
  queue: 'admin-ai-categorization',
  kind: 'ai-product-categorization',
  ownerKey: 'admin@example.com',
  status: 'running',
  progress: { phase: 'classifying', current: 12, total: 100, percentage: 12 },
  createdAt: '2026-07-26T10:00:00.000Z',
  updatedAt: '2026-07-26T10:01:00.000Z',
  completedAt: null,
  errorMessage: null,
  downloadUrl: null,
  resultSummary: null,
  cancelRequested: false,
};

describe('runtime system-wide job access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.set.mockReturnValue(mocks.transaction);
    mocks.transaction.zadd.mockReturnValue(mocks.transaction);
    mocks.transaction.expire.mockReturnValue(mocks.transaction);
    mocks.transaction.exec.mockResolvedValue([]);
    mocks.redis.set.mockReset();
    mocks.redis.eval.mockReset();
  });

  it('lists indexed snapshots from all requested queues', async () => {
    mocks.redis.zrevrange.mockResolvedValueOnce(['job-1']).mockResolvedValueOnce([]);
    mocks.redis.scan.mockResolvedValue(['0', []]);
    mocks.redis.mget.mockResolvedValue([JSON.stringify(snapshot)]);

    await expect(
      listRecentJobSnapshots(['admin-ai-categorization', 'admin-product-export'], 10),
    ).resolves.toEqual([snapshot]);

    expect(mocks.redis.zrevrange).toHaveBeenCalledWith(
      'bric:jobs:admin-ai-categorization:index',
      0,
      9,
    );
  });

  it('discovers snapshots written before queue indexing was introduced', async () => {
    mocks.redis.zrevrange.mockResolvedValue([]);
    mocks.redis.scan.mockResolvedValue([
      '0',
      [
        'bric:jobs:admin-ai-categorization:owner:admin@example.com',
        'bric:jobs:admin-ai-categorization:active',
        'bric:jobs:admin-ai-categorization:origin:hash:index',
        'bric:jobs:admin-ai-categorization:job-1',
      ],
    ]);
    mocks.redis.mget.mockResolvedValue([JSON.stringify(snapshot)]);

    await expect(listRecentJobSnapshots(['admin-ai-categorization'], 10)).resolves.toEqual([
      snapshot,
    ]);
    expect(mocks.redis.mget).toHaveBeenCalledWith(['bric:jobs:admin-ai-categorization:job-1']);
  });

  it('uses the exact durable origin index without falling back to unrelated snapshots', async () => {
    mocks.redis.zrevrange.mockResolvedValue(['job-1']);
    mocks.redis.mget.mockResolvedValue([
      JSON.stringify({ ...snapshot, origin: 'admin-ai-assistant' }),
    ]);

    await expect(
      listRecentJobSnapshots(['admin-ai-categorization'], 10, {
        origin: 'admin-ai-assistant',
      }),
    ).resolves.toEqual([{ ...snapshot, origin: 'admin-ai-assistant' }]);

    expect(mocks.redis.zrevrange).toHaveBeenCalledWith(
      expect.stringMatching(/^bric:jobs:admin-ai-categorization:origin:[a-f0-9]{64}:index$/),
      0,
      9,
    );
    expect(mocks.redis.scan).not.toHaveBeenCalled();
  });

  it('requests cancellation by exact queue and job ID and refreshes its index', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify(snapshot));

    const result = await requestJobCancellationById('admin-ai-categorization', 'job-1');

    expect(result).toMatchObject({ id: 'job-1', cancelRequested: true });
    expect(mocks.redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('zadd'"),
      5,
      'bric:jobs:admin-ai-categorization:job-1',
      'bric:jobs:admin-ai-categorization:job-1:cancel',
      'bric:jobs:admin-ai-categorization:owner:admin@example.com',
      'bric:jobs:admin-ai-categorization:index',
      'bric:jobs:admin-ai-categorization:index',
      expect.stringMatching(/"cancelRequested":true/),
      86_400,
      Date.parse(snapshot.createdAt),
      '0',
    );
  });

  it('does not cancel completed jobs', async () => {
    mocks.redis.get.mockResolvedValue(JSON.stringify({ ...snapshot, status: 'completed' }));

    await expect(
      requestJobCancellationById('admin-ai-categorization', 'job-1'),
    ).resolves.toBeNull();
    expect(mocks.redis.eval).not.toHaveBeenCalled();
  });

  it('distinguishes retryable failures from the terminal attempt', () => {
    expect(isFinalJobAttempt({ attemptsMade: 1, opts: { attempts: 3 } })).toBe(false);
    expect(isFinalJobAttempt({ attemptsMade: 3, opts: { attempts: 3 } })).toBe(true);
    expect(isFinalJobAttempt({ attemptsMade: 1, opts: {} })).toBe(true);
  });

  it('releases the active lock and records failure when job preparation fails', async () => {
    mocks.redis.get.mockResolvedValue(null);
    mocks.redis.set.mockResolvedValue('OK');
    mocks.redis.eval
      .mockRejectedValueOnce(new Error('snapshot unavailable'))
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce('OK');

    await expect(
      startOwnedJob({
        queueName: 'admin-product-export',
        kind: 'product-export',
        ownerKey: 'admin@example.com',
        origin: 'admin-ai-assistant',
        data: { format: 'xlsx' },
      }),
    ).rejects.toThrow('snapshot unavailable');

    expect(mocks.redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('get'"),
      1,
      'bric:jobs:admin-product-export:active:admin@example.com',
      expect.any(String),
    );
    expect(mocks.redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('cjson.decode'),
      5,
      expect.stringMatching(/^bric:jobs:admin-product-export:/),
      expect.stringMatching(/:cancel$/),
      'bric:jobs:admin-product-export:owner:admin@example.com',
      'bric:jobs:admin-product-export:index',
      expect.stringMatching(/^bric:jobs:admin-product-export:origin:[a-f0-9]{64}:index$/),
      expect.stringMatching(/"origin":"admin-ai-assistant".*"status":"failed"/),
      86_400,
      expect.any(Number),
      '1',
    );
  });
});
