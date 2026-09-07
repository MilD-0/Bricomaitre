import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET } from './route';

const { authMock, canMutateMock, latestJobMock, readObjectMock, deleteObjectMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    canMutateMock: vi.fn(),
    latestJobMock: vi.fn(),
    readObjectMock: vi.fn(),
    deleteObjectMock: vi.fn(),
  }),
);

vi.mock('@/lib/auth', () => ({ auth: authMock }));
vi.mock('@/lib/permissions', () => ({
  normalizePermissions: (permissions: unknown) => permissions,
}));
vi.mock('@/lib/rbac', () => ({ canMutateResource: canMutateMock }));
vi.mock('@/lib/background-jobs', () => ({
  ADMIN_ORDER_EXPORT_QUEUE: 'admin-order-export',
  getLatestExportJob: latestJobMock,
}));
vi.mock('@/lib/s3-upload', () => ({
  readPrivateS3Object: readObjectMock,
  deletePrivateS3Object: deleteObjectMock,
  isS3ObjectNotFound: (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey'),
}));

function exportJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    fileName: 'orders.xlsx',
    resultSummary: {
      artifactKey: 'exports/orders/2026-09-04/private.xlsx',
      artifactExpiresAt: '2099-09-05T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('order export download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'ops@example.com',
        isAllowed: true,
        permissions: ['orders:write'],
      },
    });
    canMutateMock.mockReturnValue(true);
    latestJobMock.mockResolvedValue(exportJob());
    deleteObjectMock.mockResolvedValue(undefined);
    readObjectMock.mockResolvedValue({
      ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      Body: {
        transformToWebStream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('private export'));
              controller.close();
            },
          }),
      },
    });
  });

  it('serves only the requesting operator latest matching job with private headers', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/orders/export/download?jobId=job-1'),
    );

    expect(latestJobMock).toHaveBeenCalledWith('admin-order-export', 'user-1');
    expect(readObjectMock).toHaveBeenCalledWith('exports/orders/2026-09-04/private.xlsx');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="orders.xlsx"');
    await expect(response.text()).resolves.toBe('private export');
  });

  it('does not expose another or older job artifact', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/orders/export/download?jobId=job-2'),
    );

    expect(response.status).toBe(404);
    expect(readObjectMock).not.toHaveBeenCalled();
  });

  it('revokes expired artifacts instead of serving them', async () => {
    latestJobMock.mockResolvedValue(
      exportJob({
        resultSummary: {
          artifactKey: 'exports/orders/2026-09-04/private.xlsx',
          artifactExpiresAt: '2000-01-01T00:00:00.000Z',
        },
      }),
    );
    const response = await GET(
      new NextRequest('http://localhost/api/orders/export/download?jobId=job-1'),
    );

    expect(response.status).toBe(410);
    expect(deleteObjectMock).toHaveBeenCalledWith('exports/orders/2026-09-04/private.xlsx');
    expect(readObjectMock).not.toHaveBeenCalled();
  });

  it('supports explicit revocation and rejects unauthorized callers', async () => {
    const revoked = await DELETE(
      new NextRequest('http://localhost/api/orders/export/download?jobId=job-1', {
        method: 'DELETE',
      }),
    );
    expect(revoked.status).toBe(200);
    expect(deleteObjectMock).toHaveBeenCalledWith('exports/orders/2026-09-04/private.xlsx');

    authMock.mockResolvedValue(null);
    const unauthorized = await GET(
      new NextRequest('http://localhost/api/orders/export/download?jobId=job-1'),
    );
    expect(unauthorized.status).toBe(401);
  });
});
