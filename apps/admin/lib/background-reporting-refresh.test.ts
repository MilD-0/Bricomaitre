import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  const jobs: Array<{ data: Record<string, unknown>; ownerKey: string }> = [];
  return {
    values,
    jobs,
    db: {},
    refreshFacts: vi.fn(),
    globalConcurrency: vi.fn(),
    redis: {
      incr: vi.fn(async (key: string) => {
        const next = Number(values.get(key) ?? 0) + 1;
        values.set(key, String(next));
        return next;
      }),
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        values.set(key, value);
        return 'OK';
      }),
    },
  };
});
vi.mock('@bric/runtime/redis', () => ({ getRedis: () => mocks.redis }));
vi.mock('@bric/runtime/jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/runtime/jobs')>()),
  getQueue: () => ({ setGlobalConcurrency: mocks.globalConcurrency }),
  startOwnedJob: vi.fn(async (input) => {
    mocks.jobs.push(input);
    return { kind: 'started', job: { id: `job-${mocks.jobs.length}`, status: 'queued' } };
  }),
}));
vi.mock('./reporting-db', () => ({ getReportingDb: () => mocks.db }));
vi.mock('./analytics-facts', () => ({ refreshAnalyticsFacts: mocks.refreshFacts }));

import {
  runAdminReportingRefreshJob,
  startAdminReportingRefreshJob,
} from './background-jobs-commerce';
import type { ReportingRefreshPayload } from './background-job-contract';

function queuedPayload(index: number): ReportingRefreshPayload {
  return {
    ...mocks.jobs[index]!.data,
    __jobMeta: {
      id: `job-${index + 1}`,
      queueName: 'admin-reporting-refresh',
      ownerKey: mocks.jobs[index]!.ownerKey,
    },
  } as ReportingRefreshPayload;
}

describe('reporting refresh revisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values.clear();
    mocks.jobs.length = 0;
    mocks.refreshFacts.mockResolvedValue({ dailyFacts: 183, cohortThrough: '2026-09-05' });
  });

  it('coalesces queued requests while retaining successors for edits during every active pass', async () => {
    await startAdminReportingRefreshJob('first');
    await startAdminReportingRefreshJob('queued-edit');
    mocks.refreshFacts
      .mockImplementationOnce(async () => {
        await startAdminReportingRefreshJob('edit-during-first-pass');
        return { dailyFacts: 183 };
      })
      .mockImplementationOnce(async () => {
        await startAdminReportingRefreshJob('edit-during-second-pass');
        return { dailyFacts: 183 };
      });
    await expect(runAdminReportingRefreshJob(queuedPayload(0))).resolves.toMatchObject({
      revision: 2,
      coalesced: false,
    });
    await expect(runAdminReportingRefreshJob(queuedPayload(1))).resolves.toMatchObject({
      coalesced: true,
    });
    await expect(runAdminReportingRefreshJob(queuedPayload(2))).resolves.toMatchObject({
      revision: 3,
      coalesced: false,
    });
    await expect(runAdminReportingRefreshJob(queuedPayload(3))).resolves.toMatchObject({
      revision: 4,
      coalesced: false,
    });
    expect(mocks.refreshFacts).toHaveBeenCalledTimes(3);
    expect(new Set(mocks.jobs.map((job) => job.ownerKey)).size).toBe(4);
    expect(mocks.globalConcurrency).toHaveBeenCalledWith(1);
  });

  it('processes a persisted pre-release job without a revision', async () => {
    await expect(
      runAdminReportingRefreshJob({
        trigger: 'old-release',
        __jobMeta: {
          id: 'old-job',
          ownerKey: 'admin-reporting',
          queueName: 'admin-reporting-refresh',
          activeScope: 'global',
        },
      }),
    ).resolves.toMatchObject({ revision: 1, coalesced: false });
    expect(mocks.refreshFacts).toHaveBeenCalledOnce();
    expect(mocks.redis.set).toHaveBeenCalledWith('bric:reporting:completed-revision', '1');
  });

  it('does not mark a failed refresh complete and retries the same queued revision', async () => {
    await startAdminReportingRefreshJob('changed-product');
    mocks.refreshFacts.mockRejectedValueOnce(new Error('database disconnected'));
    await expect(runAdminReportingRefreshJob(queuedPayload(0))).rejects.toThrow(
      'database disconnected',
    );
    expect(mocks.redis.set).not.toHaveBeenCalled();
    await expect(runAdminReportingRefreshJob(queuedPayload(0))).resolves.toMatchObject({
      revision: 1,
      coalesced: false,
    });
    expect(mocks.refreshFacts).toHaveBeenCalledTimes(2);
  });
});
