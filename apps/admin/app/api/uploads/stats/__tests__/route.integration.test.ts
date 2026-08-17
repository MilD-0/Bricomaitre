import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import { GET, POST } from '../route';

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Order'], ['BRIC-1']]), 'Orders');
const xlsxBytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
const xlsBytes = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

const { requireOpsAccessMock, authMock, getLatestExportJobMock, startStatsImportJobMock } =
  vi.hoisted(() => ({
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
    requireOpsAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/uploads/stats', { method: 'POST' }),
    );

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

  it('returns 400 when multipart parsing fails', async () => {
    const request = new NextRequest('http://localhost/api/uploads/stats', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockRejectedValue(new Error('malformed body')),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid multipart request body' });
    expect(startStatsImportJobMock).not.toHaveBeenCalled();
  });

  it('queues the spreadsheet import and returns uploader metadata', async () => {
    const formData = new FormData();
    formData.append(
      'files',
      new File([xlsxBytes], 'report.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    const request = new NextRequest('http://localhost/api/uploads/stats', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(formData),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(startStatsImportJobMock).toHaveBeenCalledWith(
      'ops@example.com',
      {
        files: [
          expect.objectContaining({ fileName: 'report.xlsx', fileBuffer: expect.any(Buffer) }),
        ],
      },
      expect.any(String),
    );
    await expect(response.json()).resolves.toEqual({
      files: [
        {
          fileName: 'report.xlsx',
          fileUrl: '/api/uploads/stats?jobId=job-1',
          fileKey: 'job-1:0',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: xlsxBytes.byteLength,
        },
      ],
      job: { id: 'job-1', status: 'queued' },
    });
  });

  it('queues all bundled spreadsheets in one import job', async () => {
    const formData = new FormData();
    formData.append(
      'files',
      new File([xlsxBytes], 'one.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    formData.append('files', new File([xlsBytes], 'two.xls', { type: 'application/vnd.ms-excel' }));
    const request = new NextRequest('http://localhost/api/uploads/stats', { method: 'POST' });
    Object.defineProperty(request, 'formData', {
      value: vi.fn().mockResolvedValue(formData),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(startStatsImportJobMock).toHaveBeenCalledWith(
      'ops@example.com',
      {
        files: [
          expect.objectContaining({ fileName: 'one.xlsx', fileBuffer: expect.any(Buffer) }),
          expect.objectContaining({ fileName: 'two.xls', fileBuffer: expect.any(Buffer) }),
        ],
      },
      expect.any(String),
    );
    await expect(response.json()).resolves.toMatchObject({
      files: [
        { fileName: 'one.xlsx', fileKey: 'job-1:0', size: xlsxBytes.byteLength },
        { fileName: 'two.xls', fileKey: 'job-1:1', size: 8 },
      ],
      job: { id: 'job-1', status: 'queued' },
    });
  });

  it('rejects declared request bodies above the aggregate limit before parsing multipart data', async () => {
    const request = new NextRequest('http://localhost/api/uploads/stats', {
      method: 'POST',
      headers: { 'content-length': String(30 * 1024 * 1024) },
    });
    const formDataMock = vi.fn();
    Object.defineProperty(request, 'formData', { value: formDataMock });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(formDataMock).not.toHaveBeenCalled();
    expect(startStatsImportJobMock).not.toHaveBeenCalled();
  });
});
