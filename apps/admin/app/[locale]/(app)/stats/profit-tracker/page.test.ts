import { beforeEach, describe, expect, it, vi } from 'vitest';

const { accessMock, redirectMock } = vi.hoisted(() => ({
  accessMock: vi.fn(),
  redirectMock: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('../../../../../lib/page-access', () => ({ requireStatsPageAccess: accessMock }));

import LegacyProfitTrackerPage from './page';

describe('legacy Profit Tracker page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    accessMock.mockResolvedValue(null);
  });

  it('redirects to Time while preserving the active range', async () => {
    await expect(
      LegacyProfitTrackerPage({
        params: Promise.resolve({ locale: 'fr' }),
        searchParams: Promise.resolve({
          range: 'custom',
          startDate: '2026-08-01',
          endDate: '2026-08-15',
          ignored: 'value',
        }),
      }),
    ).rejects.toThrow(
      'redirect:/fr/stats/time?range=custom&startDate=2026-08-01&endDate=2026-08-15',
    );
    expect(accessMock).toHaveBeenCalledWith('fr');
  });
});
