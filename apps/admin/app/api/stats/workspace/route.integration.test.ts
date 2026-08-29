import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hasDbMock, requireAnalyticsAccessMock, getAnalyticsDataMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireAnalyticsAccessMock: vi.fn(),
  getAnalyticsDataMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../../../lib/rbac', () => ({ requireAnalyticsAccess: requireAnalyticsAccessMock }));
vi.mock('../../../../lib/analytics', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/analytics')>(
    '../../../../lib/analytics',
  );
  return { ...actual, getAnalyticsData: getAnalyticsDataMock };
});

import { GET } from './route';

describe('GET /api/stats/workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireAnalyticsAccessMock.mockResolvedValue(null);
    getAnalyticsDataMock.mockResolvedValue({
      diagnostics: { queryDurationMs: 37, responseSizeBytes: 100 },
      warnings: [],
    });
  });

  it('validates and forwards one normalized section query', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/stats/workspace?view=acquisition&range=custom&startDate=2026-08-01&endDate=2026-08-19&grain=day',
      ),
    );

    expect(response.status).toBe(200);
    expect(getAnalyticsDataMock).toHaveBeenCalledWith({
      view: 'acquisition',
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-19',
      grain: 'day',
    });
    expect(response.headers.get('server-timing')).toBe('stats;dur=37');
    expect(response.headers.get('x-analytics-coverage')).toBe('complete');
    expect(response.headers.get('cache-control')).toBe('private, no-cache, must-revalidate');
  });

  it('rejects an incomplete custom range without loading analytics', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/stats/workspace?range=custom&startDate=2026-08-01'),
    );
    expect(response.status).toBe(400);
    expect(getAnalyticsDataMock).not.toHaveBeenCalled();
  });

  it('enforces analytics access and database availability', async () => {
    requireAnalyticsAccessMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    expect((await GET(new NextRequest('http://localhost/api/stats/workspace'))).status).toBe(403);

    requireAnalyticsAccessMock.mockResolvedValueOnce(null);
    hasDbMock.mockReturnValueOnce(false);
    expect((await GET(new NextRequest('http://localhost/api/stats/workspace'))).status).toBe(503);
  });
});
