import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getReportMock, requireOpsAccessMock } = vi.hoisted(() => ({
  getReportMock: vi.fn(),
  requireOpsAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true }));
vi.mock('../../../../lib/rbac', () => ({ requireAnalyticsAccess: requireOpsAccessMock }));
vi.mock('../../../../lib/profit-tracker', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/profit-tracker')>(
    '../../../../lib/profit-tracker',
  );
  return { ...actual, getProfitTrackerReport: getReportMock };
});

import { GET } from './route';

describe('GET /api/stats/profit-tracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpsAccessMock.mockImplementation(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
    getReportMock.mockResolvedValue({ summary: { profitX: 3.2 }, days: [] });
  });

  it('returns the dedicated range report without loading the monolithic stats endpoint', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/stats/profit-tracker?range=14d'),
    );
    expect(response.status).toBe(200);
    expect(getReportMock).toHaveBeenCalledWith({ range: '14d' });
    await expect(response.json()).resolves.toEqual({
      data: { summary: { profitX: 3.2 }, days: [] },
    });
  });

  it('rejects incomplete custom ranges before querying', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/stats/profit-tracker?range=custom&startDate=2026-08-01',
      ),
    );
    expect(response.status).toBe(400);
    expect(getReportMock).not.toHaveBeenCalled();
  });

  it('enforces operations access', async () => {
    requireOpsAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));
    const response = await GET(new NextRequest('http://localhost/api/stats/profit-tracker'));
    expect(response.status).toBe(403);
    expect(getReportMock).not.toHaveBeenCalled();
  });
});
