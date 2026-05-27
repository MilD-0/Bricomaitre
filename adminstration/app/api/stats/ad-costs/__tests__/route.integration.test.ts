import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, POST } from '../route';

const {
  hasDbMock,
  requireOpsAccessMock,
  listAdSpendImportBatchesMock,
  listAdCostsMock,
  upsertAdCostEntryMock,
  deleteAdCostEntryMock,
  deleteAdSpendImportBatchMock,
  authMock,
  triggerAdminReportingRefreshMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireOpsAccessMock: vi.fn(),
  listAdSpendImportBatchesMock: vi.fn(),
  listAdCostsMock: vi.fn(),
  upsertAdCostEntryMock: vi.fn(),
  deleteAdCostEntryMock: vi.fn(),
  deleteAdSpendImportBatchMock: vi.fn(),
  authMock: vi.fn(),
  triggerAdminReportingRefreshMock: vi.fn(),
}));

vi.mock('../../../../../db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireOpsAccess: requireOpsAccessMock,
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/reporting-refresh-trigger', () => ({
  triggerAdminReportingRefresh: triggerAdminReportingRefreshMock,
}));

vi.mock('../../../../../lib/stats', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/stats')>('../../../../../lib/stats');

  return {
    ...actual,
    listAdSpendImportBatches: listAdSpendImportBatchesMock,
    listAdCosts: listAdCostsMock,
    upsertAdCostEntry: upsertAdCostEntryMock,
    deleteAdCostEntry: deleteAdCostEntryMock,
    deleteAdSpendImportBatch: deleteAdSpendImportBatchMock,
  };
});

describe('app/api/stats/ad-costs/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    requireOpsAccessMock.mockReset();
    listAdSpendImportBatchesMock.mockReset();
    listAdCostsMock.mockReset();
    upsertAdCostEntryMock.mockReset();
    deleteAdCostEntryMock.mockReset();
    deleteAdSpendImportBatchMock.mockReset();
    authMock.mockReset();
    triggerAdminReportingRefreshMock.mockReset();

    hasDbMock.mockReturnValue(true);
    requireOpsAccessMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    triggerAdminReportingRefreshMock.mockResolvedValue(null);
  });

  it('returns filtered ad costs', async () => {
    listAdCostsMock.mockResolvedValue([{ id: '1', spend: 1200 }]);

    const response = await GET(new NextRequest('http://localhost/api/stats/ad-costs?range=30d'));

    expect(response.status).toBe(200);
    expect(listAdCostsMock).toHaveBeenCalledWith({ range: '30d' });
    await expect(response.json()).resolves.toEqual({ data: [{ id: '1', spend: 1200 }] });
  });

  it('returns ad spend import batches', async () => {
    listAdSpendImportBatchesMock.mockResolvedValue([{ batchId: 'batch-1', fileName: 'ads.xlsx' }]);

    const response = await GET(new NextRequest('http://localhost/api/stats/ad-costs?batches=true'));

    expect(response.status).toBe(200);
    expect(listAdSpendImportBatchesMock).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ data: [{ batchId: 'batch-1', fileName: 'ads.xlsx' }] });
  });

  it('rejects invalid POST payloads', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/stats/ad-costs', {
        method: 'POST',
        body: JSON.stringify({ date: 'bad-date' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('creates or updates an ad-cost entry', async () => {
    upsertAdCostEntryMock.mockResolvedValue({ id: 3, created: true });

    const response = await POST(
      new NextRequest('http://localhost/api/stats/ad-costs', {
        method: 'POST',
        body: JSON.stringify({
          date: '2026-03-30',
          platform: 'facebook',
          campaignName: 'Prospecting',
          spend: 1200,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertAdCostEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignName: 'Prospecting',
        date: '2026-03-30',
        platform: 'facebook',
        spend: 1200,
      }),
      { email: 'ops@example.com', name: 'Ops' },
    );
    await expect(response.json()).resolves.toEqual({ data: { id: 3, created: true } });
  });

  it('deletes an ad-cost entry', async () => {
    deleteAdCostEntryMock.mockResolvedValue({ id: 3 });

    const response = await DELETE(new NextRequest('http://localhost/api/stats/ad-costs?id=3', { method: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(deleteAdCostEntryMock).toHaveBeenCalledWith('3', { email: 'ops@example.com', name: 'Ops' });
    await expect(response.json()).resolves.toEqual({ data: { id: 3 } });
  });

  it('deletes an ad spend import batch', async () => {
    deleteAdSpendImportBatchMock.mockResolvedValue({ batchId: 'batch-1', deletedRows: 12 });

    const response = await DELETE(new NextRequest('http://localhost/api/stats/ad-costs?batchId=batch-1', { method: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(deleteAdSpendImportBatchMock).toHaveBeenCalledWith('batch-1');
    expect(triggerAdminReportingRefreshMock).toHaveBeenCalledWith('ad-spend-import-batch-delete');
    await expect(response.json()).resolves.toEqual({ data: { batchId: 'batch-1', deletedRows: 12 } });
  });

  it('returns the RBAC denial response', async () => {
    requireOpsAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/stats/ad-costs?range=30d'));

    expect(response.status).toBe(403);
  });
});
