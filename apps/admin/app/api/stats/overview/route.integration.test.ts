import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { analyticsMock, sectionMock } = vi.hoisted(() => ({
  analyticsMock: vi.fn(),
  sectionMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true }));
vi.mock('../../../../lib/rbac', () => ({ requireAnalyticsAccess: analyticsMock }));
vi.mock('../../../../lib/stats-sections', () => ({ getAnalyticsSectionData: sectionMock }));

import { GET, PUT } from './route';

describe('/api/stats/overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyticsMock.mockResolvedValue(null);
    sectionMock.mockResolvedValue({
      filters: { range: '30d', startDate: '2026-07-22', endDate: '2026-08-20' },
      diagnostics: { queryDurationMs: 12, responseSizeBytes: 450 },
    });
  });

  it('returns the section payload with non-financial diagnostics headers', async () => {
    const response = await GET(new NextRequest('http://localhost/api/stats/overview?range=30d'));
    expect(response.status).toBe(200);
    expect(response.headers.get('server-timing')).toBe('stats;dur=12');
    expect(response.headers.get('x-stats-response-bytes')).toBe('450');
    expect(sectionMock).toHaveBeenCalledWith('overview', { range: '30d' });
  });

  it('validates custom ranges and enforces analytics RBAC', async () => {
    const invalid = await GET(new NextRequest('http://localhost/api/stats/overview?range=custom'));
    expect(invalid.status).toBe(400);
    const denied = new Response('denied', { status: 403 });
    analyticsMock.mockResolvedValueOnce(denied);
    expect(
      (await GET(new NextRequest('http://localhost/api/stats/overview?range=30d'))).status,
    ).toBe(403);
  });

  it('refreshes only the requested section', async () => {
    const response = await PUT(
      new NextRequest('http://localhost/api/stats/overview', {
        method: 'PUT',
        body: JSON.stringify({ range: '14d' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(sectionMock).toHaveBeenCalledWith('overview', { range: '14d' }, true);
  });
});
