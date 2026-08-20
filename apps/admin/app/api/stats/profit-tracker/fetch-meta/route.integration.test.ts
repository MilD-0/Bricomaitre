import { beforeEach, describe, expect, it, vi } from 'vitest';

const { syncMock, reportMock, requireMutationMock } = vi.hoisted(() => ({
  syncMock: vi.fn(),
  reportMock: vi.fn(),
  requireMutationMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true }));
vi.mock('../../../../../lib/rbac', () => ({ requireMutationAccess: requireMutationMock }));
vi.mock('../../../../../lib/meta-ads-insights', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/meta-ads-insights')>(
    '../../../../../lib/meta-ads-insights',
  );
  return { ...actual, syncMetaAdsInsights: syncMock };
});
vi.mock('../../../../../lib/profit-tracker', () => ({ getProfitTrackerReport: reportMock }));

import { POST } from './route';

describe('POST /api/stats/profit-tracker/fetch-meta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMutationMock.mockResolvedValue(null);
    syncMock.mockResolvedValue({ rows: 4, since: '2026-08-15', until: '2026-08-15' });
    reportMock.mockResolvedValue({ days: [{ date: '2026-08-15', spendEur: 25 }] });
  });

  it('refreshes one exact Meta day and returns the saved tracker row', async () => {
    const response = await POST(
      new Request('http://localhost/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ date: '2026-08-15' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith({
      since: '2026-08-15',
      until: '2026-08-15',
      lookbackDays: 1,
      trigger: 'manual-profit-tracker',
    });
    expect(reportMock).toHaveBeenCalledWith({
      range: 'custom',
      startDate: '2026-08-15',
      endDate: '2026-08-15',
    });
  });

  it('rejects malformed dates before calling Meta', async () => {
    const response = await POST(
      new Request('http://localhost/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ date: 'yesterday' }),
      }),
    );
    expect(response.status).toBe(400);
    expect(syncMock).not.toHaveBeenCalled();
  });

  it('synchronizes an inclusive active range and caps it at 90 days', async () => {
    const response = await POST(
      new Request('http://localhost/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ since: '2026-08-01', until: '2026-08-15' }),
      }),
    );
    expect(response.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith({
      since: '2026-08-01',
      until: '2026-08-15',
      lookbackDays: 15,
      trigger: 'manual-profit-tracker',
    });

    const rejected = await POST(
      new Request('http://localhost/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ since: '2026-01-01', until: '2026-08-15' }),
      }),
    );
    expect(rejected.status).toBe(400);
  });
});
