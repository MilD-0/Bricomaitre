import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const { authMock, getLatestExportJobMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  getLatestExportJobMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/background-jobs', () => ({
  ADMIN_PRODUCT_EXPORT_QUEUE: 'admin-product-export',
  getLatestExportJob: getLatestExportJobMock,
}));

describe('app/api/products/export-all/download/route', () => {
  beforeEach(() => {
    authMock.mockReset();
    getLatestExportJobMock.mockReset();

    authMock.mockResolvedValue({
      user: { id: 'user-1', email: 'admin@example.com', role: 'admin' },
    });
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
    authMock.mockResolvedValue({
      user: { id: 'user-1', email: 'ops@example.com', role: 'employee' },
    });

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

it('denies an existing assets-only custom role whose slug collides with admin', async () => {
  getLatestExportJobMock.mockClear();
  authMock.mockResolvedValue({
    user: {
      id: 'user-1',
      email: 'ops@example.com',
      role: 'admin',
      roleDefinitionId: 7,
      permissions: ['assets_write'],
    },
  });
  const response = await GET(
    new NextRequest('http://localhost/api/products/export-all/download?jobId=job-1'),
  );
  expect(response.status).toBe(403);
  expect(getLatestExportJobMock).not.toHaveBeenCalled();
});
