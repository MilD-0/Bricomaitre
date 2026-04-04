import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../route';

const { requireOpsAccessMock, authMock, getLatestExportJobMock, startAdCostsImportJobMock } = vi.hoisted(() => ({
  requireOpsAccessMock: vi.fn(),
  authMock: vi.fn(),
  getLatestExportJobMock: vi.fn(),
  startAdCostsImportJobMock: vi.fn(),
}));

vi.mock('../../../../../../lib/rbac', () => ({
  requireOpsAccess: requireOpsAccessMock,
}));

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/background-jobs', () => ({
  ADMIN_AD_COST_IMPORT_QUEUE: 'admin-ad-cost-import',
  getLatestExportJob: getLatestExportJobMock,
  startAdCostsImportJob: startAdCostsImportJobMock,
}));

describe('app/api/stats/ad-costs/import/route', () => {
  beforeEach(() => {
    requireOpsAccessMock.mockReset();
    authMock.mockReset();
    getLatestExportJobMock.mockReset();
    startAdCostsImportJobMock.mockReset();

    requireOpsAccessMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    getLatestExportJobMock.mockResolvedValue(null);
    startAdCostsImportJobMock.mockResolvedValue({
      kind: 'started',
      job: { id: 'job-9', status: 'queued' },
    });
  });

  it('returns 400 when no file is provided', async () => {
    const request = new NextRequest('http://localhost/api/stats/ad-costs/import', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(new FormData()),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns the latest queued ad-cost import job', async () => {
    getLatestExportJobMock.mockResolvedValue({ id: 'job-8', status: 'running' });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-ad-cost-import', 'ops@example.com');
    await expect(response.json()).resolves.toEqual({ job: { id: 'job-8', status: 'running' } });
  });

  it('queues an ad-cost spreadsheet import', async () => {
    const formData = new FormData();
    formData.append('file', new File(['excel'], 'ads.xlsx'));
    formData.append('rate', '230');

    const request = new NextRequest('http://localhost/api/stats/ad-costs/import', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(formData),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(startAdCostsImportJobMock).toHaveBeenCalledWith(
      'ops@example.com',
      expect.objectContaining({
        fileName: 'ads.xlsx',
        fileBuffer: expect.any(Buffer),
        rate: 230,
        actor: { email: 'ops@example.com', name: 'Ops' },
      }),
      expect.any(String),
    );
    await expect(response.json()).resolves.toEqual({
      files: [
        {
          fileName: 'ads.xlsx',
          fileUrl: '/api/stats/ad-costs/import?jobId=job-9',
          fileKey: 'job-9',
          contentType: 'application/octet-stream',
          size: 5,
        },
      ],
      job: { id: 'job-9', status: 'queued' },
    });
  });

  it('returns the RBAC denial response', async () => {
    requireOpsAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await POST(new NextRequest('http://localhost/api/stats/ad-costs/import', { method: 'POST' }));

    expect(response.status).toBe(403);
  });
});
