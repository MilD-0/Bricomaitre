import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteDayMock, refreshFactsMock, requireMutationMock } = vi.hoisted(() => ({
  deleteDayMock: vi.fn(),
  refreshFactsMock: vi.fn(),
  requireMutationMock: vi.fn(),
}));

vi.mock('../../../../../../lib/analytics-facts', () => ({
  refreshAnalyticsFactsAfterMutation: refreshFactsMock,
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true }));
vi.mock('../../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationMock,
}));
vi.mock('../../../../../../lib/profit-tracker', () => ({
  deleteProfitTrackerDay: deleteDayMock,
}));

import { DELETE } from './route';

describe('profit tracker day detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMutationMock.mockResolvedValue(null);
    refreshFactsMock.mockResolvedValue(true);
    deleteDayMock.mockImplementation(async (date: string) => {
      return date;
    });
  });

  it('deletes a calendar day', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/stats/profit-tracker/days/2026-08-18', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ date: '2026-08-18' }) },
    );

    expect(response.status).toBe(200);
    expect(deleteDayMock).toHaveBeenCalledWith('2026-08-18');
    expect(refreshFactsMock).toHaveBeenCalledOnce();
  });

  it.each(['today', '2026-02-30'])('rejects invalid calendar date %s', async (date) => {
    const response = await DELETE(
      new Request('http://localhost/api/stats/profit-tracker/days/today', { method: 'DELETE' }),
      { params: Promise.resolve({ date }) },
    );

    expect(response.status).toBe(400);
    expect(deleteDayMock).not.toHaveBeenCalled();
  });
  it('preserves database failures instead of reporting an invalid date', async () => {
    deleteDayMock.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(
      DELETE(new Request('http://localhost'), { params: Promise.resolve({ date: '2026-08-18' }) }),
    ).rejects.toThrow('Database unavailable');
    expect(refreshFactsMock).not.toHaveBeenCalled();
  });
});
