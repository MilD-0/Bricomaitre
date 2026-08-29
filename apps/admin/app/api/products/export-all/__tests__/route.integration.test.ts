import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, POST } from '../route';

const {
  authMock,
  canExportAllProductsMock,
  getLatestExportJobMock,
  startProductExportJobMock,
  cancelExportJobMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  canExportAllProductsMock: vi.fn(),
  getLatestExportJobMock: vi.fn(),
  startProductExportJobMock: vi.fn(),
  cancelExportJobMock: vi.fn(),
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/permissions', () => ({
  canExportAllProducts: canExportAllProductsMock,
}));

vi.mock('../../../../../lib/background-jobs', () => ({
  ADMIN_PRODUCT_EXPORT_QUEUE: 'admin-product-export',
  getLatestExportJob: getLatestExportJobMock,
  startProductExportJob: startProductExportJobMock,
  cancelExportJob: cancelExportJobMock,
}));

describe('app/api/products/export-all/route', () => {
  beforeEach(() => {
    authMock.mockReset();
    canExportAllProductsMock.mockReset();
    getLatestExportJobMock.mockReset();
    startProductExportJobMock.mockReset();
    cancelExportJobMock.mockReset();

    authMock.mockResolvedValue({
      user: { id: 'user-1', email: 'admin@example.com', role: 'admin' },
    });
    canExportAllProductsMock.mockReturnValue(true);
    getLatestExportJobMock.mockResolvedValue(null);
    cancelExportJobMock.mockResolvedValue({ id: 'job-1', status: 'running' });
    startProductExportJobMock.mockResolvedValue({
      kind: 'started',
      job: {
        id: 'job-1',
        status: 'queued',
        fileName: null,
        progress: { phase: 'queued', current: 0, total: 0, percentage: 0 },
        errorMessage: null,
        downloadPath: null,
      },
    });
  });

  it('returns 401 when no session is available', async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(
      new NextRequest('http://localhost/api/products/export-all', { method: 'POST' }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when the caller is not admin or developer', async () => {
    canExportAllProductsMock.mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/products/export-all'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns the current queued job for the caller', async () => {
    getLatestExportJobMock.mockResolvedValue({ id: 'job-1', status: 'running' });

    const response = await GET(new NextRequest('http://localhost/api/products/export-all'));

    expect(response.status).toBe(200);
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-product-export', 'user-1');
    await expect(response.json()).resolves.toEqual({ job: { id: 'job-1', status: 'running' } });
  });

  it('returns 429 when another export is already running', async () => {
    startProductExportJobMock.mockResolvedValue({
      kind: 'busy',
      job: { id: 'job-9', status: 'running' },
    });

    const response = await POST(
      new NextRequest('http://localhost/api/products/export-all', { method: 'POST' }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Another product export is already running.',
      job: { id: 'job-9', status: 'running' },
    });
  });

  it('starts the queued export job for an authorized caller', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/products/export-all', { method: 'POST' }),
    );

    expect(response.status).toBe(201);
    expect(startProductExportJobMock).toHaveBeenCalledWith('user-1', expect.any(String));
    await expect(response.json()).resolves.toEqual({
      job: expect.objectContaining({ id: 'job-1', status: 'queued' }),
    });
  });

  it('cancels the running export for the caller', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/products/export-all', { method: 'DELETE' }),
    );

    expect(response.status).toBe(200);
    expect(cancelExportJobMock).toHaveBeenCalledWith('admin-product-export', 'user-1');
    await expect(response.json()).resolves.toEqual({ job: { id: 'job-1', status: 'running' } });
  });

  it('returns 404 when there is no running export to cancel', async () => {
    cancelExportJobMock.mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest('http://localhost/api/products/export-all', { method: 'DELETE' }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'No export job is currently running.',
    });
  });
});
