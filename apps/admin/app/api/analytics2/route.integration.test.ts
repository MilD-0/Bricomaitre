import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hasDbMock, requireAnalyticsAccessMock, getAnalytics2DataMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireAnalyticsAccessMock: vi.fn(),
  getAnalytics2DataMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../../lib/rbac', () => ({ requireAnalyticsAccess: requireAnalyticsAccessMock }));
vi.mock('../../../lib/analytics2', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/analytics2')>(
    '../../../lib/analytics2',
  );
  return { ...actual, getAnalytics2Data: getAnalytics2DataMock };
});

import { GET } from './route';

describe('GET /api/analytics2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireAnalyticsAccessMock.mockResolvedValue(null);
    getAnalytics2DataMock.mockResolvedValue({
      diagnostics: { queryDurationMs: 37, responseSizeBytes: 100 },
      warnings: [],
    });
  });

  it('validates and forwards one normalized section query', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/analytics2?view=acquisition&range=custom&startDate=2026-08-01&endDate=2026-08-19&grain=day',
      ),
    );

    expect(response.status).toBe(200);
    expect(getAnalytics2DataMock).toHaveBeenCalledWith({
      view: 'acquisition',
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-19',
      grain: 'day',
    });
    expect(response.headers.get('server-timing')).toBe('analytics2;dur=37');
    expect(response.headers.get('x-analytics-coverage')).toBe('complete');
  });

  it('rejects an incomplete custom range without loading analytics', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/analytics2?range=custom&startDate=2026-08-01'),
    );
    expect(response.status).toBe(400);
    expect(getAnalytics2DataMock).not.toHaveBeenCalled();
  });

  it('enforces analytics access and database availability', async () => {
    requireAnalyticsAccessMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    expect(
      (await GET(new NextRequest('http://localhost/api/analytics2'))).status,
    ).toBe(403);

    requireAnalyticsAccessMock.mockResolvedValueOnce(null);
    hasDbMock.mockReturnValueOnce(false);
    expect(
      (await GET(new NextRequest('http://localhost/api/analytics2'))).status,
    ).toBe(503);
  });
});
