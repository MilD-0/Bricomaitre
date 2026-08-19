import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from '../route';

const {
  hasDbMock,
  requireOpsAccessMock,
  deleteManualOrderMock,
  authMock,
  triggerAdminReportingRefreshMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireOpsAccessMock: vi.fn(),
  deleteManualOrderMock: vi.fn(),
  authMock: vi.fn(),
  triggerAdminReportingRefreshMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../../lib/rbac', () => ({
  requireAnalyticsAccess: requireOpsAccessMock,
}));

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/reporting-refresh-trigger', () => ({
  triggerAdminReportingRefresh: triggerAdminReportingRefreshMock,
}));

vi.mock('../../../../../../lib/manual-orders', () => ({
  deleteManualOrder: deleteManualOrderMock,
}));

describe('app/api/stats/manual-order/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    requireOpsAccessMock.mockReset();
    deleteManualOrderMock.mockReset();
    authMock.mockReset();
    triggerAdminReportingRefreshMock.mockReset();

    hasDbMock.mockReturnValue(true);
    requireOpsAccessMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    triggerAdminReportingRefreshMock.mockResolvedValue(null);
  });

  it('returns 404 when the order does not exist', async () => {
    deleteManualOrderMock.mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest('http://localhost/api/stats/manual-order/1', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );

    expect(response.status).toBe(404);
  });

  it('rejects a malformed order id before querying', async () => {
    const response = await DELETE(
      new NextRequest('http://localhost/api/stats/manual-order/1junk', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: '1junk' }),
      },
    );

    expect(response.status).toBe(400);
    expect(deleteManualOrderMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ error: 'Invalid manual order id' });
  });

  it('deletes the manual order', async () => {
    deleteManualOrderMock.mockResolvedValue({ id: 1 });

    const response = await DELETE(
      new NextRequest('http://localhost/api/stats/manual-order/1', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );

    expect(response.status).toBe(200);
    expect(deleteManualOrderMock).toHaveBeenCalledWith(1, {
      email: 'ops@example.com',
      name: 'Ops',
    });
    await expect(response.json()).resolves.toEqual({ data: { id: 1 } });
  });

  it('returns the RBAC denial response', async () => {
    requireOpsAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await DELETE(
      new NextRequest('http://localhost/api/stats/manual-order/1', { method: 'DELETE' }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );

    expect(response.status).toBe(403);
  });
});
