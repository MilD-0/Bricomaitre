import { describe, expect, it, vi } from 'vitest';

import { refreshReleaseReporting } from './release-reporting-refresh';

describe('refreshReleaseReporting', () => {
  it('rebuilds snapshots before derived facts and binds the run to the release', async () => {
    const refreshSnapshots = vi.fn().mockResolvedValue({ snapshots: 9 });
    const refreshFacts = vi.fn().mockResolvedValue({ dailyFacts: 183 });

    const result = await refreshReleaseReporting('abc123', {
      refreshSnapshots,
      refreshFacts,
    });

    expect(refreshSnapshots).toHaveBeenCalledWith({ trigger: 'release:abc123' });
    expect(refreshFacts).toHaveBeenCalledOnce();
    expect(refreshSnapshots.mock.invocationCallOrder[0]).toBeLessThan(
      refreshFacts.mock.invocationCallOrder[0]!,
    );
    expect(result).toEqual({
      trigger: 'release:abc123',
      snapshots: { snapshots: 9 },
      facts: { dailyFacts: 183 },
    });
  });

  it('uses an explicit unknown release marker when identity is unavailable', async () => {
    const refreshSnapshots = vi.fn().mockResolvedValue({});
    const refreshFacts = vi.fn().mockResolvedValue({});

    await refreshReleaseReporting('   ', { refreshSnapshots, refreshFacts });

    expect(refreshSnapshots).toHaveBeenCalledWith({ trigger: 'release:unknown' });
  });
});
