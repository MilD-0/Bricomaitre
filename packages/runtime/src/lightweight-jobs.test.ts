import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  getJob: vi.fn(),
  queueConstructed: vi.fn(),
}));

vi.mock('bullmq', () => ({
  Job: class {},
  Queue: class {
    constructor(name: string) {
      mocks.queueConstructed(name);
    }
    add = mocks.add;
    getJob = mocks.getJob;
  },
  QueueEvents: class {},
  Worker: class {},
}));
vi.mock('./redis', () => ({
  getBullRedisConnection: vi.fn(() => ({})),
  getRedis: vi.fn(),
}));

import { enqueueLightweightJob, lightweightJobId } from './jobs';

describe('lightweight queue enqueueing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not enqueue a second live job for the same event', async () => {
    mocks.getJob.mockResolvedValue({ id: 'existing' });

    await expect(
      enqueueLightweightJob({
        queueName: 'storefront-analytics',
        jobName: 'analytics-event',
        dedupeKey: 'event-1',
        data: { eventId: 'event-1' },
      }),
    ).resolves.toEqual({
      kind: 'existing',
      jobId: lightweightJobId('storefront-analytics', 'event-1'),
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('uses durable retries and removes terminal payloads', async () => {
    mocks.getJob.mockResolvedValue(null);
    mocks.add.mockResolvedValue({ id: 'created' });

    await expect(
      enqueueLightweightJob({
        queueName: 'storefront-analytics',
        jobName: 'analytics-event',
        dedupeKey: 'event-1',
        data: { eventId: 'event-1' },
      }),
    ).resolves.toMatchObject({ kind: 'created' });

    expect(mocks.add).toHaveBeenCalledWith(
      'analytics-event',
      { eventId: 'event-1' },
      expect.objectContaining({
        attempts: 8,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: true,
      }),
    );
  });

  it('reuses one queue client for repeated request-path enqueueing', async () => {
    mocks.getJob.mockResolvedValue(null);
    mocks.add.mockResolvedValue({ id: 'created' });

    await enqueueLightweightJob({
      queueName: 'cache-test-analytics',
      jobName: 'analytics-event',
      dedupeKey: 'event-1',
      data: {},
    });
    await enqueueLightweightJob({
      queueName: 'cache-test-analytics',
      jobName: 'analytics-event',
      dedupeKey: 'event-2',
      data: {},
    });

    expect(mocks.queueConstructed).toHaveBeenCalledTimes(1);
  });
});
