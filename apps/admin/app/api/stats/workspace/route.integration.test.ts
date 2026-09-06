import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hasDbMock, requireAnalyticsAccessMock, getAnalyticsDataMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireAnalyticsAccessMock: vi.fn(),
  getAnalyticsDataMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../../../lib/rbac', () => ({ requireAnalyticsAccess: requireAnalyticsAccessMock }));
vi.mock('../../../../lib/analytics-snapshots', () => ({
  getAnalyticsSnapshot: getAnalyticsDataMock,
}));

import { GET } from './route';

describe('GET /api/stats/workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireAnalyticsAccessMock.mockImplementation(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
    getAnalyticsDataMock.mockResolvedValue({
      diagnostics: { queryDurationMs: 37, responseSizeBytes: 100, cache: { state: 'fresh' } },
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
    expect(getAnalyticsDataMock).toHaveBeenCalledWith(
      {
        view: 'acquisition',
        range: 'custom',
        startDate: '2026-08-01',
        endDate: '2026-08-19',
        grain: 'day',
      },
      { refresh: false },
    );
    expect(response.headers.get('server-timing')).toMatch(/^stats;dur=\d+$/);
    expect(response.headers.get('x-analytics-coverage')).toBe('complete');
    expect(response.headers.get('x-analytics-cache')).toBe('fresh');
    expect(response.headers.get('cache-control')).toBe('private, no-cache, must-revalidate');
  });

  it('forwards an explicit refresh without bypassing access control', async () => {
    await GET(new NextRequest('http://localhost/api/stats/workspace?refresh=1'));
    expect(requireAnalyticsAccessMock).toHaveBeenCalledOnce();
    expect(getAnalyticsDataMock).toHaveBeenCalledWith(
      { view: 'command', range: '30d', grain: 'auto' },
      { refresh: true },
    );
  });

  it('rejects an incomplete custom range without loading analytics', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/stats/workspace?range=custom&startDate=2026-08-01'),
    );
    expect(response.status).toBe(400);
    expect(getAnalyticsDataMock).not.toHaveBeenCalled();
  });

  it('enforces analytics access and database availability', async () => {
    requireAnalyticsAccessMock.mockImplementationOnce(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));
    expect((await GET(new NextRequest('http://localhost/api/stats/workspace'))).status).toBe(403);

    requireAnalyticsAccessMock.mockImplementationOnce(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
    hasDbMock.mockReturnValueOnce(false);
    expect((await GET(new NextRequest('http://localhost/api/stats/workspace'))).status).toBe(503);
  });
});
