import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCostsAndAssumptionsMock, hasDbMock, requireAnalyticsAccessMock } = vi.hoisted(() => ({
  getCostsAndAssumptionsMock: vi.fn(),
  hasDbMock: vi.fn(),
  requireAnalyticsAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../../../lib/rbac', () => ({ requireAnalyticsAccess: requireAnalyticsAccessMock }));
vi.mock('../../../../lib/stats-sections', () => ({
  getCostsAndAssumptions: getCostsAndAssumptionsMock,
}));

import { GET } from './route';

describe('/api/stats/costs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireAnalyticsAccessMock.mockResolvedValue(null);
    getCostsAndAssumptionsMock.mockResolvedValue({
      diagnostics: { queryDurationMs: 18, responseSizeBytes: 640 },
    });
  });

  it('enforces analytics access before loading financial assumptions', async () => {
    requireAnalyticsAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const response = await GET(new NextRequest('http://localhost/api/stats/costs?range=30d'));
    expect(response.status).toBe(403);
    expect(getCostsAndAssumptionsMock).not.toHaveBeenCalled();
  });

  it('returns controlled unavailable and malformed-range responses', async () => {
    hasDbMock.mockReturnValueOnce(false);
    const unavailable = await GET(new NextRequest('http://localhost/api/stats/costs?range=30d'));
    expect(unavailable.status).toBe(503);

    const malformed = await GET(new NextRequest('http://localhost/api/stats/costs?range=custom'));
    expect(malformed.status).toBe(400);
    expect(getCostsAndAssumptionsMock).not.toHaveBeenCalled();
  });

  it('returns report diagnostics and forwards validated filters', async () => {
    const response = await GET(new NextRequest('http://localhost/api/stats/costs?range=14d'));
    expect(response.status).toBe(200);
    expect(response.headers.get('server-timing')).toBe('stats;dur=18');
    expect(response.headers.get('x-stats-response-bytes')).toBe('640');
    expect(getCostsAndAssumptionsMock).toHaveBeenCalledWith({ range: '14d' });
  });
});
