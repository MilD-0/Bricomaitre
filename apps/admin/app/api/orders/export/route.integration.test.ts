import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, POST } from './route';

const {
  authMock,
  canMutateResourceMock,
  getLatestExportJobMock,
  startOrderExportJobMock,
  cancelExportJobMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  canMutateResourceMock: vi.fn(),
  getLatestExportJobMock: vi.fn(),
  startOrderExportJobMock: vi.fn(),
  cancelExportJobMock: vi.fn(),
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/permissions', () => ({
  normalizePermissions: (permissions: unknown) => permissions,
}));

vi.mock('../../../../lib/rbac', () => ({
  canMutateResource: canMutateResourceMock,
}));

vi.mock('../../../../lib/background-jobs', () => ({
  ADMIN_ORDER_EXPORT_QUEUE: 'admin-order-export',
  getLatestExportJob: getLatestExportJobMock,
  startOrderExportJob: startOrderExportJobMock,
  cancelExportJob: cancelExportJobMock,
}));

vi.mock('../../../../lib/sentry', () => ({
  captureAdminException: vi.fn(),
  getRequestId: () => 'request-1',
  withRequestIdHeaders: (requestId: string) => ({ 'x-request-id': requestId }),
}));

describe('app/api/orders/export/route', () => {
  beforeEach(() => {
    authMock.mockReset();
    canMutateResourceMock.mockReset();
    getLatestExportJobMock.mockReset();
    startOrderExportJobMock.mockReset();
    cancelExportJobMock.mockReset();

    authMock.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'ops@example.com',
        isAllowed: true,
        permissions: ['orders:write'],
      },
    });
    canMutateResourceMock.mockReturnValue(true);
    getLatestExportJobMock.mockResolvedValue(null);
    startOrderExportJobMock.mockResolvedValue({
      kind: 'started',
      job: { id: 'export-1', status: 'queued' },
    });
    cancelExportJobMock.mockResolvedValue({ id: 'export-1', status: 'cancelled' });
  });

  it('returns the current user export job', async () => {
    getLatestExportJobMock.mockResolvedValue({ id: 'export-1', status: 'running' });

    const response = await GET(new NextRequest('http://localhost/api/orders/export'));

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('request-1');
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-order-export', 'user-1');
  });

  it('starts an export with exact, deduplicated identifiers', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/orders/export', {
        method: 'POST',
        body: JSON.stringify({ mode: 'selected', orderIds: [11, '12', 12] }),
      }),
    );

    expect(response.status).toBe(201);
    expect(startOrderExportJobMock).toHaveBeenCalledWith(
      'user-1',
      { mode: 'selected', orderIds: [11, 12] },
      'request-1',
    );
  });

  it('rejects malformed identifiers instead of starting a partial export', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/orders/export', {
        method: 'POST',
        body: JSON.stringify({ mode: 'selected', orderIds: [11, '1e2'] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(startOrderExportJobMock).not.toHaveBeenCalled();
  });

  it('preserves busy queue behavior', async () => {
    startOrderExportJobMock.mockResolvedValue({
      kind: 'busy',
      job: { id: 'export-1', status: 'running' },
    });

    const response = await POST(
      new NextRequest('http://localhost/api/orders/export', {
        method: 'POST',
        body: JSON.stringify({ mode: 'confirmed', orderIds: [11] }),
      }),
    );

    expect(response.status).toBe(429);
  });

  it('cancels the current user export job', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/orders/export', { method: 'DELETE' }),
    );

    expect(response.status).toBe(200);
    expect(cancelExportJobMock).toHaveBeenCalledWith('admin-order-export', 'user-1');
  });

  it('returns authorization failures before reading job state', async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(new NextRequest('http://localhost/api/orders/export'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(getLatestExportJobMock).not.toHaveBeenCalled();
  });

  it('returns permission failures before reading job state', async () => {
    canMutateResourceMock.mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/orders/export'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(getLatestExportJobMock).not.toHaveBeenCalled();
  });
});
