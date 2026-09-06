import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invalidate, schedule, getDb } = vi.hoisted(() => ({
  invalidate: vi.fn(),
  schedule: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock('@bric/db/client', () => ({ getDb }));
vi.mock('./analytics-snapshots', () => ({ invalidateAnalyticsSnapshots: invalidate }));
vi.mock('./reporting-refresh-trigger', () => ({ triggerAdminReportingRefresh: schedule }));

import { refreshAnalyticsFactsAfterMutation } from './analytics-facts';

describe('economics mutation acknowledgment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidate.mockResolvedValue(undefined);
    schedule.mockResolvedValue({ started: true });
  });

  it('invalidates readers and schedules existing background work without querying history', async () => {
    expect(await refreshAnalyticsFactsAfterMutation()).toBe(true);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(schedule).toHaveBeenCalledWith('economics-mutation');
    expect(getDb).not.toHaveBeenCalled();
  });

  it('does not report a committed mutation as failed when scheduling is unavailable', async () => {
    schedule.mockResolvedValue(null);
    expect(await refreshAnalyticsFactsAfterMutation()).toBe(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it('still schedules durable refresh when snapshot invalidation fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    invalidate.mockRejectedValueOnce(new Error('Redis unavailable'));
    try {
      expect(await refreshAnalyticsFactsAfterMutation()).toBe(true);
      expect(schedule).toHaveBeenCalledWith('economics-mutation');
    } finally {
      error.mockRestore();
    }
  });
});
