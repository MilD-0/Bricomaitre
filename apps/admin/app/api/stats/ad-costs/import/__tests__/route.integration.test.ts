import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import { GET, POST } from '../route';

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  workbook,
  XLSX.utils.aoa_to_sheet([
    ['Date', 'Amount'],
    ['2026-08-01', 10],
  ]),
  'Ads',
);
const xlsxBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;

const { requireOpsAccessMock, authMock, getLatestExportJobMock, startAdCostsImportJobMock } =
  vi.hoisted(() => ({
    requireOpsAccessMock: vi.fn(),
    authMock: vi.fn(),
    getLatestExportJobMock: vi.fn(),
    startAdCostsImportJobMock: vi.fn(),
  }));

vi.mock('@/lib/rbac', () => ({
  requireAnalyticsAccess: requireOpsAccessMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/background-jobs', () => ({
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

    requireOpsAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    getLatestExportJobMock.mockResolvedValue(null);
    startAdCostsImportJobMock.mockResolvedValue({
      kind: 'started',
      job: { id: 'job-9', status: 'queued' },
    });
  });

  it('returns 400 when no file is provided', async () => {
    const request = new NextRequest('http://localhost/api/stats/ad-costs/import', {
      method: 'POST',
    });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(new FormData()),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when multipart parsing fails', async () => {
    const request = new NextRequest('http://localhost/api/stats/ad-costs/import', {
      method: 'POST',
    });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockRejectedValue(new Error('malformed body')),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid multipart request body' });
    expect(startAdCostsImportJobMock).not.toHaveBeenCalled();
  });

  it('rejects declared oversized requests before parsing multipart data', async () => {
    const request = new NextRequest('http://localhost/api/stats/ad-costs/import', {
      method: 'POST',
      headers: { 'content-length': String(30 * 1024 * 1024) },
    });
    const formData = vi.fn();
    Object.defineProperty(request, 'formData', { value: formData });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
    expect(startAdCostsImportJobMock).not.toHaveBeenCalled();
  });

  it('returns the latest queued ad-cost import job', async () => {
    getLatestExportJobMock.mockResolvedValue({ id: 'job-8', status: 'running' });

    const response = await GET(new NextRequest('http://localhost/api/stats/ad-costs/import'));

    expect(response.status).toBe(200);
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-ad-cost-import', 'ops@example.com');
    await expect(response.json()).resolves.toEqual({ job: { id: 'job-8', status: 'running' } });
  });

  it('queues an ad-cost spreadsheet import', async () => {
    const formData = new FormData();
    formData.append('file', new File([Uint8Array.from(xlsxBytes)], 'ads.xlsx'));
    formData.append('rate', '230');

    const request = new NextRequest('http://localhost/api/stats/ad-costs/import', {
      method: 'POST',
    });
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
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: xlsxBytes.byteLength,
        },
      ],
      job: { id: 'job-9', status: 'queued' },
    });
  });

  it('rejects multiple spreadsheets instead of silently ignoring extras', async () => {
    const formData = new FormData();
    formData.append('files', new File([Uint8Array.from(xlsxBytes)], 'one.xlsx'));
    formData.append('files', new File([Uint8Array.from(xlsxBytes)], 'two.xlsx'));
    const request = new NextRequest('http://localhost/api/stats/ad-costs/import', {
      method: 'POST',
    });
    Object.defineProperty(request, 'formData', { value: vi.fn().mockResolvedValue(formData) });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(startAdCostsImportJobMock).not.toHaveBeenCalled();
  });

  it('rejects invalid currency conversion rates', async () => {
    const formData = new FormData();
    formData.append('file', new File([Uint8Array.from(xlsxBytes)], 'ads.xlsx'));
    formData.append('rate', '-1');
    const request = new NextRequest('http://localhost/api/stats/ad-costs/import', {
      method: 'POST',
    });
    Object.defineProperty(request, 'formData', { value: vi.fn().mockResolvedValue(formData) });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'rate must be a positive number no greater than 100000',
    });
    expect(startAdCostsImportJobMock).not.toHaveBeenCalled();
  });

  it('returns the RBAC denial response', async () => {
    requireOpsAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const response = await POST(
      new NextRequest('http://localhost/api/stats/ad-costs/import', { method: 'POST' }),
    );

    expect(response.status).toBe(403);
  });
});
