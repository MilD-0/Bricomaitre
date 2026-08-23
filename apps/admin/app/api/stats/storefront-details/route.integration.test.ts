import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { hasDbMock, requireAnalyticsAccessMock, getDetailsMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireAnalyticsAccessMock: vi.fn(),
  getDetailsMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('../../../../lib/rbac', () => ({ requireAnalyticsAccess: requireAnalyticsAccessMock }));
vi.mock('../../../../lib/analytics2', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/analytics2')>(
    '../../../../lib/analytics2',
  );
  return { ...actual, getAnalytics2StorefrontDetails: getDetailsMock };
});

import { GET } from './route';

describe('GET /api/stats/storefront-details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hasDbMock.mockReturnValue(true);
    requireAnalyticsAccessMock.mockResolvedValue(null);
    getDetailsMock.mockResolvedValue({ data: { trend: [] }, generatedAt: '2026-08-19' });
  });

  it('loads only the secondary Storefront surface for the normalized range', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/stats/storefront-details?range=90d&grain=week'),
    );

    expect(response.status).toBe(200);
    expect(getDetailsMock).toHaveBeenCalledWith({
      view: 'storefront',
      range: '90d',
      grain: 'week',
    });
    expect(response.headers.get('cache-control')).toBe('private, no-cache, must-revalidate');
  });

  it('enforces analytics access before loading details', async () => {
    requireAnalyticsAccessMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    expect(
      (await GET(new NextRequest('http://localhost/api/stats/storefront-details'))).status,
    ).toBe(403);
    expect(getDetailsMock).not.toHaveBeenCalled();
  });
});
