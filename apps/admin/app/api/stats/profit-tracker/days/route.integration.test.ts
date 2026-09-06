import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getReportMock, upsertDayMock, refreshFactsMock, requireOpsMock, requireMutationMock } =
  vi.hoisted(() => ({
    getReportMock: vi.fn(),
    upsertDayMock: vi.fn(),
    refreshFactsMock: vi.fn(),
    requireOpsMock: vi.fn(),
    requireMutationMock: vi.fn(),
  }));

vi.mock('../../../../../lib/analytics-facts', () => ({
  refreshAnalyticsFactsAfterMutation: refreshFactsMock,
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
    getProfitTrackerReport: getReportMock,
    upsertProfitTrackerDay: upsertDayMock,
  };
});

import { GET, POST } from './route';

describe('profit tracker days route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpsMock.mockImplementation(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
    requireMutationMock.mockImplementation(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
    getReportMock.mockResolvedValue({ days: [{ date: '2026-08-15' }] });
    upsertDayMock.mockImplementation(async (value) => value);
    refreshFactsMock.mockResolvedValue(true);
  });

  it('returns only the range day facts', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/stats/profit-tracker/days?range=30d'),
    );
    await expect(response.json()).resolves.toEqual({ data: [{ date: '2026-08-15' }] });
  });

  it('accepts partial manual economics without requiring Meta fields', async () => {
    const input = {
      date: '2026-08-15',
      grossProfitDzd: 100000,
      confirmedOrders: 15,
    };
    const response = await POST(
      new Request('http://localhost/api/stats/profit-tracker/days', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(200);
    expect(upsertDayMock).toHaveBeenCalledWith(input);
    expect(refreshFactsMock).toHaveBeenCalledOnce();
  });

  it('rejects out-of-range return rates', async () => {
    const response = await POST(
      new Request('http://localhost/api/stats/profit-tracker/days', {
        method: 'POST',
        body: JSON.stringify({ date: '2026-08-15', returnRatePct: 101 }),
      }),
    );
    expect(response.status).toBe(400);
    expect(upsertDayMock).not.toHaveBeenCalled();
  });
});
