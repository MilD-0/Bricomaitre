import { afterAll, expect, it, vi } from 'vitest';
import { createQueueWorker, getQueue, getJobSnapshot } from '@bric/runtime/jobs';
import { closeRedisConnections, getRedis } from '@bric/runtime/redis';

const mocks = vi.hoisted(() => ({
  queue: `reporting-revisions-${crypto.randomUUID()}`,
  refresh: vi.fn(),
}));
vi.mock('../lib/background-job-contract', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/background-job-contract')>()),
  ADMIN_REPORTING_REFRESH_QUEUE: mocks.queue,
}));
vi.mock('../lib/analytics-facts', () => ({ refreshAnalyticsFacts: mocks.refresh }));
vi.mock('../lib/reporting-db', () => ({ getReportingDb: () => ({}) }));
import {
  startAdminReportingRefreshJob,
  runAdminReportingRefreshJob,
} from '../lib/background-jobs-commerce';
import type { ReportingRefreshPayload } from '../lib/background-job-contract';

const keys = ['bric:reporting:requested-revision', 'bric:reporting:completed-revision'];
const previousValues = new Map<string, string | null>();
const workers: ReturnType<typeof createQueueWorker<ReportingRefreshPayload>>[] = [];
afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  await getQueue(mocks.queue).obliterate({ force: true });
  await getQueue(mocks.queue).close();
  const redis = getRedis();
  for (const [key, value] of previousValues) {
    if (value === null) await redis.del(key);
    else await redis.set(key, value);
  }
  let cursor = '0';
  do {
    const [next, matches] = await redis.scan(cursor, 'MATCH', `*${mocks.queue}*`, 'COUNT', 100);
    cursor = next;
    if (matches.length) await redis.unlink(...matches);
  } while (cursor !== '0');
  await closeRedisConnections();
});

it('retains a durable successor during refresh and serializes across two real workers', async () => {
  const redis = getRedis();
  for (const key of keys) previousValues.set(key, await redis.get(key));
  let releaseFirst!: () => void;
  const firstHeld = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let enteredFirst!: () => void;
  const firstEntered = new Promise<void>((resolve) => {
    enteredFirst = resolve;
  });
  let concurrent = 0,
    maximumConcurrent = 0;
  mocks.refresh.mockImplementation(async () => {
    concurrent++;
    maximumConcurrent = Math.max(maximumConcurrent, concurrent);
    if (mocks.refresh.mock.calls.length === 1) {
      enteredFirst();
      await firstHeld;
    }
    concurrent--;
    return { dailyFacts: 1, cohortThrough: '2026-09-05' };
  });
  const first = await startAdminReportingRefreshJob('first');
  workers.push(
    createQueueWorker<ReportingRefreshPayload>(mocks.queue, runAdminReportingRefreshJob),
  );
  workers.push(
    createQueueWorker<ReportingRefreshPayload>(mocks.queue, runAdminReportingRefreshJob),
  );
  await firstEntered;
  try {
    const next = await startAdminReportingRefreshJob('edit-during-refresh');
    expect(next.kind).toBe('started');
    expect(await getQueue(mocks.queue).getWaitingCount()).toBe(1);
    expect(await getQueue(mocks.queue).getActiveCount()).toBe(1);
    releaseFirst();
    await vi.waitFor(
      async () => {
        expect((await getJobSnapshot(mocks.queue, first.job!.id))?.status).toBe('completed');
        expect((await getJobSnapshot(mocks.queue, next.job!.id))?.status).toBe('completed');
      },
      { timeout: 10_000 },
    );
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(maximumConcurrent).toBe(1);
  } finally {
    releaseFirst();
  }
});
