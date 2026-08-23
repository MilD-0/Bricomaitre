import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, refreshFacts, refreshSnapshots, snapshotRun } = vi.hoisted(() => {
  const snapshotRun = vi.fn();
  const db = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: snapshotRun })),
      })),
    })),
  };
  return {
    db,
    refreshFacts: vi.fn(),
    refreshSnapshots: vi.fn(),
    snapshotRun,
  };
});

vi.mock('@bric/db/client', () => ({ getDb: () => db }));
vi.mock('./stats', () => ({ refreshAdminReportingSnapshots: refreshSnapshots }));
vi.mock('./analytics2-facts', () => ({ refreshAnalytics2Facts: refreshFacts }));

import { runAdminReportingRefreshJob } from './background-jobs';

describe('runAdminReportingRefreshJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotRun.mockResolvedValue([{ pendingRefresh: false, pendingTrigger: null }]);
    refreshSnapshots.mockResolvedValue({ generatedAt: '2026-08-19T00:00:00.000Z' });
    refreshFacts.mockResolvedValue({ dailyFacts: 183, cohortThrough: '2026-08-17' });
  });

  it('refreshes materialized Stats facts after the reporting snapshot', async () => {
    await runAdminReportingRefreshJob({
      __jobMeta: {
        id: 'reporting-refresh-1',
        ownerKey: 'admin-reporting',
        queueName: 'admin-reporting-refresh',
        activeScope: 'global',
      },
      trigger: 'order-update',
    });

    expect(refreshSnapshots).toHaveBeenCalledWith({
      runId: 'reporting-refresh-1',
      trigger: 'order-update',
      sourceImportBatchId: null,
    });
    expect(refreshFacts).toHaveBeenCalledWith({ db });
    expect(refreshFacts.mock.invocationCallOrder[0]).toBeGreaterThan(
      refreshSnapshots.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
