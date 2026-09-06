import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listCostsMock, createCostMock, refreshFactsMock, requireOpsMock, requireMutationMock } =
  vi.hoisted(() => ({
    listCostsMock: vi.fn(),
    createCostMock: vi.fn(),
    refreshFactsMock: vi.fn(),
    requireOpsMock: vi.fn(),
    requireMutationMock: vi.fn(),
  }));

vi.mock('../../../../../lib/analytics-facts', () => ({
  refreshAnalyticsFactsAfterMutation: refreshFactsMock,
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true, getDb: () => ({}) }));
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
import { AdminMutationIdempotencyConflictError } from '../../../../../lib/admin-mutation-idempotency';

describe('profit tracker costs route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpsMock.mockResolvedValue(null);
    requireMutationMock.mockResolvedValue(null);
    listCostsMock.mockResolvedValue([]);
    createCostMock.mockImplementation(async (value) => ({ id: 1, ...value }));
    refreshFactsMock.mockResolvedValue(true);
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
        body: JSON.stringify({ ...input, requestId: '8f3ca9ac-8441-4f5a-a8cd-22d1569644a8' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(createCostMock).toHaveBeenCalledWith(input, {}, '8f3ca9ac-8441-4f5a-a8cd-22d1569644a8');
    expect(refreshFactsMock).toHaveBeenCalledOnce();
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

  it('requires a retry identity and returns a conflict for changed retry payloads', async () => {
    const input = { name: 'Rent', amountDzd: 60000, period: 'monthly', startDate: '2026-08-01' };
    const post = (body: unknown) =>
      POST(
        new Request('http://localhost/api/stats/profit-tracker/costs', {
          method: 'POST',
          body: JSON.stringify(body),
        }),
      );
    expect((await post(input)).status).toBe(400);
    createCostMock.mockRejectedValueOnce(new AdminMutationIdempotencyConflictError());
    expect(
      (await post({ ...input, requestId: '8f3ca9ac-8441-4f5a-a8cd-22d1569644a8' })).status,
    ).toBe(409);
    expect(refreshFactsMock).not.toHaveBeenCalled();
  });
});
