import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getAiStatsDataMock, hasDbMock, requireAnalyticsAccessMock } = vi.hoisted(() => ({
  getAiStatsDataMock: vi.fn(),
  hasDbMock: vi.fn(),
  requireAnalyticsAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('@/lib/rbac', () => ({ requireAnalyticsAccess: requireAnalyticsAccessMock }));
vi.mock('@/lib/ai-stats', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai-stats')>('@/lib/ai-stats');
  return { ...actual, getAiStatsData: getAiStatsDataMock };
});

import { GET } from './route';

describe('GET /api/stats/ai', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireAnalyticsAccessMock.mockImplementation(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
    getAiStatsDataMock.mockResolvedValue({
      diagnostics: { queryDurationMs: 19, responseSizeBytes: 812 },
    });
  });

  it('validates and forwards a surface-specific custom range', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/stats/ai?surface=shopping&range=custom&startDate=2026-08-01&endDate=2026-08-19&grain=day',
      ),
    );

    expect(response.status).toBe(200);
    expect(getAiStatsDataMock).toHaveBeenCalledWith({
      surface: 'shopping',
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-19',
      grain: 'day',
    });
    expect(response.headers.get('server-timing')).toBe('stats;dur=19');
    expect(response.headers.get('x-stats-response-bytes')).toBe('812');
  });

  it('rejects invalid filters before querying', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/stats/ai?surface=operations&range=custom'),
    );
    expect(response.status).toBe(400);
    expect(getAiStatsDataMock).not.toHaveBeenCalled();
  });

  it('rejects impossible calendar dates before querying', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/stats/ai?range=custom&startDate=2026-02-31&endDate=2026-03-03',
      ),
    );
    expect(response.status).toBe(400);
    expect(getAiStatsDataMock).not.toHaveBeenCalled();
  });

  it('enforces analytics access and database availability', async () => {
    requireAnalyticsAccessMock.mockImplementationOnce(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));
    expect((await GET(new NextRequest('http://localhost/api/stats/ai'))).status).toBe(403);

    requireAnalyticsAccessMock.mockImplementationOnce(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
    hasDbMock.mockReturnValueOnce(false);
    expect((await GET(new NextRequest('http://localhost/api/stats/ai'))).status).toBe(503);
  });
});
