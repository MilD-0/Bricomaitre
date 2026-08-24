import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getSettingsMock,
  updateSettingsMock,
  refreshFactsMock,
  requireOpsMock,
  requireMutationMock,
} = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  updateSettingsMock: vi.fn(),
  refreshFactsMock: vi.fn(),
  requireOpsMock: vi.fn(),
  requireMutationMock: vi.fn(),
}));

vi.mock('../../../../../lib/analytics2-facts', () => ({
  refreshAnalytics2FactsAfterMutation: refreshFactsMock,
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
    getProfitTrackerSettings: getSettingsMock,
    updateProfitTrackerSettings: updateSettingsMock,
  };
});

import { GET, PUT } from './route';

describe('profit tracker settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpsMock.mockResolvedValue(null);
    requireMutationMock.mockResolvedValue(null);
    getSettingsMock.mockResolvedValue({ fxRate: 280, defaultReturnRate: 10, restFrom: null });
    updateSettingsMock.mockImplementation(async (value) => value);
    refreshFactsMock.mockResolvedValue(true);
  });

  it('reads settings with operations access', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { fxRate: 280, defaultReturnRate: 10, restFrom: null },
    });
  });

  it('validates and updates settings without repricing day rows', async () => {
    const input = { fxRate: 285, defaultReturnRate: 12, restFrom: '2026-08-01' };
    const response = await PUT(
      new Request('http://localhost/api/stats/profit-tracker/settings', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    );
    expect(response.status).toBe(200);
    expect(requireMutationMock).toHaveBeenCalledWith('stats');
    expect(updateSettingsMock).toHaveBeenCalledWith(input);
    expect(refreshFactsMock).toHaveBeenCalledOnce();
  });

  it('rejects an invalid FX rate', async () => {
    const response = await PUT(
      new Request('http://localhost/api/stats/profit-tracker/settings', {
        method: 'PUT',
        body: JSON.stringify({ fxRate: 0, defaultReturnRate: 10, restFrom: null }),
      }),
    );
    expect(response.status).toBe(400);
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it('stops at authorization failures', async () => {
    requireMutationMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const response = await PUT(
      new Request('http://localhost/api/stats/profit-tracker/settings', {
        method: 'PUT',
        body: '{}',
      }),
    );
    expect(response.status).toBe(403);
  });
});
