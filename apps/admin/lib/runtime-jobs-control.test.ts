import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redis: {
    zrevrange: vi.fn(),
    scan: vi.fn(),
    mget: vi.fn(),
  },
}));

vi.mock('@bric/runtime/redis', () => ({
  getRedis: () => mocks.redis,
  getBullRedisConnection: vi.fn(),
}));

import { listRecentJobSnapshots, type JobSnapshot } from '@bric/runtime/jobs';

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
    vi.resetAllMocks();
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
});
