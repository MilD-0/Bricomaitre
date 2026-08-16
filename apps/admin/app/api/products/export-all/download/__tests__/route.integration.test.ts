import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const { authMock, canExportAllProductsMock, getLatestExportJobMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  canExportAllProductsMock: vi.fn(),
  getLatestExportJobMock: vi.fn(),
}));

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/permissions', () => ({
  canExportAllProducts: canExportAllProductsMock,
}));

vi.mock('../../../../../../lib/background-jobs', () => ({
  ADMIN_PRODUCT_EXPORT_QUEUE: 'admin-product-export',
  getLatestExportJob: getLatestExportJobMock,
}));

describe('app/api/products/export-all/download/route', () => {
  beforeEach(() => {
    authMock.mockReset();
    canExportAllProductsMock.mockReset();
    getLatestExportJobMock.mockReset();

    authMock.mockResolvedValue({
      user: { id: 'user-1', email: 'admin@example.com', role: 'admin' },
    });
    canExportAllProductsMock.mockReturnValue(true);
    getLatestExportJobMock.mockResolvedValue({
      id: 'job-1',
      downloadPath: 'https://cdn.example.com/products-export.xlsx',
    });
  });

  it('returns 400 when jobId is missing', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/products/export-all/download'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing jobId' });
  });

  it('returns 403 for non privileged roles', async () => {
    canExportAllProductsMock.mockReturnValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/products/export-all/download?jobId=job-1'),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns 404 when the requested file is not available', async () => {
    getLatestExportJobMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest('http://localhost/api/products/export-all/download?jobId=job-1'),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Export file not found.' });
  });

  it('redirects to the generated spreadsheet for the owner', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/products/export-all/download?jobId=job-1'),
    );

    expect(response.status).toBe(307);
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-product-export', 'user-1');
    expect(response.headers.get('location')).toBe('https://cdn.example.com/products-export.xlsx');
  });
});
