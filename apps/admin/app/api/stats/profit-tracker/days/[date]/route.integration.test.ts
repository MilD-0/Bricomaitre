import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteDayMock, requireMutationMock } = vi.hoisted(() => ({
  deleteDayMock: vi.fn(),
  requireMutationMock: vi.fn(),
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
    deleteDayMock.mockImplementation(async (date: string) => {
      if (date === 'today') throw new Error('Invalid calendar date');
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
  });

  it('rejects malformed dates', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/stats/profit-tracker/days/today', { method: 'DELETE' }),
      { params: Promise.resolve({ date: 'today' }) },
    );

    expect(response.status).toBe(400);
    expect(deleteDayMock).toHaveBeenCalledWith('today');
  });
});
