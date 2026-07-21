import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redirectMock, requireStatsPageAccessMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  requireStatsPageAccessMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));

vi.mock('../../../../../lib/page-access', () => ({
  requireStatsPageAccess: requireStatsPageAccessMock,
}));

import StatsPaidClicksPage from './page';

describe('StatsPaidClicksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStatsPageAccessMock.mockResolvedValue(null);
  });

  it('redirects the retired paid-clicks page into Meta Ads', async () => {
    await StatsPaidClicksPage({ params: Promise.resolve({ locale: 'en' }) });
    expect(requireStatsPageAccessMock).toHaveBeenCalledWith('en');
    expect(redirectMock).toHaveBeenCalledWith('/en/stats/meta-ads');
  });
});
