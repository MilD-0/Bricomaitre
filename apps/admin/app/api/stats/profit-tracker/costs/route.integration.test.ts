import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listCostsMock, createCostMock, requireOpsMock, requireMutationMock } = vi.hoisted(() => ({
  listCostsMock: vi.fn(),
  createCostMock: vi.fn(),
  requireOpsMock: vi.fn(),
  requireMutationMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true }));
vi.mock('../../../../../lib/rbac', () => ({
  requireAnalyticsAccess: requireOpsMock,
  requireMutationAccess: requireMutationMock,
}));
vi.mock('../../../../../lib/profit-tracker', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/profit-tracker')>(
    '../../../../../lib/profit-tracker',
  );
  return {
    ...actual,
    listProfitTrackerCosts: listCostsMock,
    createProfitTrackerCost: createCostMock,
  };
});

import { GET, POST } from './route';

describe('profit tracker costs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpsMock.mockResolvedValue(null);
    requireMutationMock.mockResolvedValue(null);
    listCostsMock.mockResolvedValue([]);
    createCostMock.mockImplementation(async (value) => ({ id: 1, ...value }));
  });

  it('lists operating costs', async () => {
    await expect((await GET()).json()).resolves.toEqual({ data: [] });
  });

  it('creates a bounded monthly cost', async () => {
    const input = {
      name: 'Rent',
      amountDzd: 60000,
      period: 'monthly',
      startDate: '2026-08-01',
      endDate: null,
    };
    const response = await POST(
      new Request('http://localhost/api/stats/profit-tracker/costs', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(200);
    expect(createCostMock).toHaveBeenCalledWith(input);
  });

  it('rejects an end date before the start date', async () => {
    const response = await POST(
      new Request('http://localhost/api/stats/profit-tracker/costs', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Rent',
          amountDzd: 60000,
          period: 'monthly',
          startDate: '2026-08-02',
          endDate: '2026-08-01',
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(createCostMock).not.toHaveBeenCalled();
  });
});
