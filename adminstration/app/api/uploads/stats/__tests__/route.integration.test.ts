import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../route';

const {
  requireOpsAccessMock,
  authMock,
  getLatestExportJobMock,
  startStatsImportJobMock,
} = vi.hoisted(() => ({
  requireOpsAccessMock: vi.fn(),
  authMock: vi.fn(),
  getLatestExportJobMock: vi.fn(),
  startStatsImportJobMock: vi.fn(),
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireOpsAccess: requireOpsAccessMock,
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/background-jobs', () => ({
  ADMIN_STATS_IMPORT_QUEUE: 'admin-stats-import',
  getLatestExportJob: getLatestExportJobMock,
  startStatsImportJob: startStatsImportJobMock,
}));

describe('app/api/uploads/stats/route', () => {
  beforeEach(() => {
    requireOpsAccessMock.mockReset();
    authMock.mockReset();
    getLatestExportJobMock.mockReset();
    startStatsImportJobMock.mockReset();

    requireOpsAccessMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com' } });
    getLatestExportJobMock.mockResolvedValue(null);
    startStatsImportJobMock.mockResolvedValue({
      kind: 'started',
      job: { id: 'job-1', status: 'queued' },
    });
  });

  it('returns ops access denial when blocked', async () => {
    requireOpsAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await POST(new NextRequest('http://localhost/api/uploads/stats', { method: 'POST' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns the latest queued import job', async () => {
    getLatestExportJobMock.mockResolvedValue({ id: 'job-2', status: 'running' });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-stats-import', 'ops@example.com');
    await expect(response.json()).resolves.toEqual({ job: { id: 'job-2', status: 'running' } });
  });

  it('returns 400 when no files are provided', async () => {
    const request = new NextRequest('http://localhost/api/uploads/stats', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(new FormData()),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'No files uploaded' });
  });

  it('queues the spreadsheet import and returns uploader metadata', async () => {
    const formData = new FormData();
    formData.append('files', new File(['excel'], 'report.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const request = new NextRequest('http://localhost/api/uploads/stats', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(formData),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(startStatsImportJobMock).toHaveBeenCalledWith(
      'ops@example.com',
      expect.objectContaining({ fileName: 'report.xlsx', fileBuffer: expect.any(Buffer) }),
      expect.any(String),
    );
    await expect(response.json()).resolves.toEqual({
      files: [
        {
          fileName: 'report.xlsx',
          fileUrl: '/api/uploads/stats?jobId=job-1',
          fileKey: 'job-1',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 5,
        },
      ],
      job: { id: 'job-1', status: 'queued' },
    });
  });
});
