import { expect, it, vi } from 'vitest';
import { refreshReleaseReporting } from './release-reporting-refresh';
import { refreshAnalyticsFacts } from './analytics-facts';
vi.mock('./analytics-facts', () => ({ refreshAnalyticsFacts: vi.fn() }));
it('binds current fact refresh results to the release and propagates failures', async () => {
  vi.mocked(refreshAnalyticsFacts).mockResolvedValueOnce({
    dailyFacts: 183,
    cohortThrough: '2026-09-05',
  });
  await expect(refreshReleaseReporting('abc123')).resolves.toEqual({
    trigger: 'release:abc123',
    facts: { dailyFacts: 183, cohortThrough: '2026-09-05' },
  });
  vi.mocked(refreshAnalyticsFacts).mockRejectedValueOnce(new Error('database unavailable'));
  await expect(refreshReleaseReporting('abc123')).rejects.toThrow('database unavailable');
});
