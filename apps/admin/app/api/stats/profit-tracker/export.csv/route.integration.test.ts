import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { exportCsvMock, requireOpsMock } = vi.hoisted(() => ({
  exportCsvMock: vi.fn(),
  requireOpsMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true }));
vi.mock('@/lib/rbac', () => ({ requireAnalyticsAccess: requireOpsMock }));
vi.mock('@/lib/profit-tracker', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/profit-tracker')>('@/lib/profit-tracker');
  return { ...actual, exportProfitTrackerCsv: exportCsvMock };
});

import { GET } from './route';

describe('profit tracker CSV export route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOpsMock.mockImplementation(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
    exportCsvMock.mockResolvedValue('date,profit_x\n2026-08-18,2');
  });

  it('exports the selected custom range', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/stats/profit-tracker/export.csv?range=custom&startDate=2026-08-01&endDate=2026-08-18',
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toContain('bricomaitre-profit-tracker.csv');
    expect(exportCsvMock).toHaveBeenCalledWith({
      range: 'custom',
      startDate: '2026-08-01',
      endDate: '2026-08-18',
    });
    await expect(response.text()).resolves.toContain('2026-08-18,2');
  });

  it('enforces operations access', async () => {
    requireOpsMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));
    const response = await GET(
      new NextRequest('http://localhost/api/stats/profit-tracker/export.csv?range=30d'),
    );

    expect(response.status).toBe(403);
    expect(exportCsvMock).not.toHaveBeenCalled();
  });
});
