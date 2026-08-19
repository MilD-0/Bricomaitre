import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteCostMock, updateCostMock, requireMutationMock } = vi.hoisted(() => ({
  deleteCostMock: vi.fn(),
  updateCostMock: vi.fn(),
  requireMutationMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true }));
vi.mock('../../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationMock,
}));
vi.mock('../../../../../../lib/profit-tracker', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../lib/profit-tracker')>(
    '../../../../../../lib/profit-tracker',
  );
  return {
    ...actual,
    deleteProfitTrackerCost: deleteCostMock,
    updateProfitTrackerCost: updateCostMock,
  };
});

import { DELETE, PUT } from './route';

const context = { params: Promise.resolve({ id: '12' }) };
const cost = {
  name: 'Rent',
  amountDzd: 60_000,
  period: 'monthly',
  startDate: '2026-08-01',
  endDate: null,
};

describe('profit tracker cost detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMutationMock.mockResolvedValue(null);
    updateCostMock.mockResolvedValue({ id: 12, ...cost });
    deleteCostMock.mockResolvedValue(12);
  });

  it('updates an operating cost', async () => {
    const response = await PUT(
      new Request('http://localhost/api/stats/profit-tracker/costs/12', {
        method: 'PUT',
        body: JSON.stringify(cost),
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(updateCostMock).toHaveBeenCalledWith(12, cost);
  });

  it('deletes an operating cost', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/stats/profit-tracker/costs/12', { method: 'DELETE' }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: 12 } });
  });

  it('rejects a non-positive id', async () => {
    const response = await DELETE(
      new Request('http://localhost/api/stats/profit-tracker/costs/0', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '0' }) },
    );

    expect(response.status).toBe(400);
    expect(deleteCostMock).not.toHaveBeenCalled();
  });
});
