import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH, POST, PUT } from '../route';

const {
  hasDbMock,
  requireOpsAccessMock,
  authMock,
  getStatsDashboardMock,
  getLatestExportJobMock,
  startStatsImportJobMock,
  listImportHistoryMock,
  refreshStatsDashboardMock,
  deleteImportBatchMock,
  dismissUnmatchedReferenceMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireOpsAccessMock: vi.fn(),
  authMock: vi.fn(),
  getStatsDashboardMock: vi.fn(),
  getLatestExportJobMock: vi.fn(),
  startStatsImportJobMock: vi.fn(),
  listImportHistoryMock: vi.fn(),
  refreshStatsDashboardMock: vi.fn(),
  deleteImportBatchMock: vi.fn(),
  dismissUnmatchedReferenceMock: vi.fn(),
}));
const { revalidateServerTagsMock } = vi.hoisted(() => ({
  revalidateServerTagsMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireOpsAccess: requireOpsAccessMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/background-jobs', () => ({
  ADMIN_STATS_IMPORT_QUEUE: 'admin-stats-import',
  getLatestExportJob: getLatestExportJobMock,
  startStatsImportJob: startStatsImportJobMock,
}));

vi.mock('../../../../lib/stats', async () => {
  const actual = await vi.importActual<typeof import('../../../../lib/stats')>('../../../../lib/stats');

  return {
    ...actual,
    getStatsDashboard: getStatsDashboardMock,
    listImportHistoryPage: listImportHistoryMock,
    refreshStatsDashboard: refreshStatsDashboardMock,
    deleteImportBatch: deleteImportBatchMock,
    dismissUnmatchedReference: dismissUnmatchedReferenceMock,
  };
});

vi.mock('../../../../lib/server-cache', () => ({
  CACHE_TAGS: {
    stats: 'stats',
    statsHistory: 'stats-history',
  },
  revalidateServerTags: revalidateServerTagsMock,
}));

describe('app/api/stats/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    requireOpsAccessMock.mockReset();
    authMock.mockReset();
    getStatsDashboardMock.mockReset();
    getLatestExportJobMock.mockReset();
    startStatsImportJobMock.mockReset();
    listImportHistoryMock.mockReset();
    refreshStatsDashboardMock.mockReset();
    deleteImportBatchMock.mockReset();
    dismissUnmatchedReferenceMock.mockReset();
    revalidateServerTagsMock.mockReset();

    requireOpsAccessMock.mockResolvedValue(null);
    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com' } });
  });

  it('returns ops access denial for GET', async () => {
    requireOpsAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/stats'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns stats data for a validated query', async () => {
    getStatsDashboardMock.mockResolvedValue({ summary: { totalOrders: 4 } });

    const response = await GET(new NextRequest('http://localhost/api/stats?range=30d'));

    expect(response.status).toBe(200);
    expect(getStatsDashboardMock).toHaveBeenCalledWith({ range: '30d' });
    await expect(response.json()).resolves.toEqual({ data: { summary: { totalOrders: 4 } } });
  });

  it('returns history when requested', async () => {
    listImportHistoryMock.mockResolvedValue({
      items: [{ batchId: 'batch-1' }],
      page: 2,
      pageSize: 10,
      totalItems: 11,
      totalPages: 2,
    });

    const response = await GET(new NextRequest('http://localhost/api/stats?history=true&page=2&pageSize=10'));

    expect(response.status).toBe(200);
    expect(listImportHistoryMock).toHaveBeenCalledWith({ page: 2, pageSize: 10 });
    await expect(response.json()).resolves.toEqual({
      data: {
        items: [{ batchId: 'batch-1' }],
        page: 2,
        pageSize: 10,
        totalItems: 11,
        totalPages: 2,
      },
    });
  });

  it('returns the latest import job when requested', async () => {
    getLatestExportJobMock.mockResolvedValue({ id: 'job-3', status: 'running' });

    const response = await GET(new NextRequest('http://localhost/api/stats?job=true'));

    expect(response.status).toBe(200);
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-stats-import', 'ops@example.com');
    await expect(response.json()).resolves.toEqual({ job: { id: 'job-3', status: 'running' } });
  });

  it('rejects POST without a file', async () => {
    const request = new NextRequest('http://localhost/api/stats', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(new FormData()),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'No file provided' });
  });

  it('queues a spreadsheet file import', async () => {
    startStatsImportJobMock.mockResolvedValue({ kind: 'started', job: { id: 'job-1', status: 'queued' } });
    const formData = new FormData();
    formData.append('file', new File(['excel'], 'report.xlsx'));
    const request = new NextRequest('http://localhost/api/stats', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(formData),
    });

    const response = await POST(request);

    expect(response.status).toBe(201);
    expect(startStatsImportJobMock).toHaveBeenCalledWith(
      'ops@example.com',
      expect.objectContaining({ fileName: 'report.xlsx', fileBuffer: expect.any(Buffer) }),
    );
    await expect(response.json()).resolves.toEqual({
      job: { id: 'job-1', status: 'queued' },
    });
  });

  it('refreshes a stats snapshot for the requested filters', async () => {
    refreshStatsDashboardMock.mockResolvedValue({ summary: { totalOrders: 8 } });

    const request = new NextRequest('http://localhost/api/stats', {
      method: 'PUT',
      body: JSON.stringify({ range: 'custom', startDate: '2026-05-01', endDate: '2026-05-27' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(refreshStatsDashboardMock).toHaveBeenCalledWith(
      { range: 'custom', startDate: '2026-05-01', endDate: '2026-05-27' },
      'manual-refresh',
    );
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('stats', 'stats-history');
    await expect(response.json()).resolves.toEqual({ data: { summary: { totalOrders: 8 } } });
  });

  it('deletes an import batch', async () => {
    deleteImportBatchMock.mockResolvedValue({ deletedOrders: 12, deletedBatch: { id: 4 } });

    const response = await DELETE(new NextRequest('http://localhost/api/stats?batchId=batch-1', { method: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(deleteImportBatchMock).toHaveBeenCalledWith('batch-1');
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('stats', 'stats-history');
    await expect(response.json()).resolves.toEqual({ data: { deletedOrders: 12, deletedBatch: { id: 4 } } });
  });

  it('dismisses an unmatched warning entry', async () => {
    dismissUnmatchedReferenceMock.mockResolvedValue({ removed: true });

    const request = new NextRequest('http://localhost/api/stats', {
      method: 'PATCH',
      body: JSON.stringify({ batchId: 'batch-1', reference: 'ref-404' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await PATCH(request);

    expect(response.status).toBe(200);
    expect(dismissUnmatchedReferenceMock).toHaveBeenCalledWith('batch-1', 'ref-404');
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('stats', 'stats-history');
    await expect(response.json()).resolves.toEqual({ data: { removed: true } });
  });
});
