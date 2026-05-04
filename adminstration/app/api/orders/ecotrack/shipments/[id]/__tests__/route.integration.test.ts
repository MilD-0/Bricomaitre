import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const {
  hasDbMock,
  authMock,
  requireMutationAccessMock,
  loadEcotrackOrderDetailMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  loadEcotrackOrderDetailMock: vi.fn(),
}));

vi.mock('../../../../../../../db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../../../lib/admin-ecotrack-orders-data', async () => {
  const actual = await vi.importActual<typeof import('../../../../../../../lib/admin-ecotrack-orders-data')>('../../../../../../../lib/admin-ecotrack-orders-data');
  return {
    ...actual,
    loadEcotrackOrderDetail: loadEcotrackOrderDetailMock,
  };
});

describe('app/api/orders/ecotrack/shipments/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    loadEcotrackOrderDetailMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    requireMutationAccessMock.mockResolvedValue(null);
    loadEcotrackOrderDetailMock.mockResolvedValue({ orderId: 11 });
  });

  it('returns RBAC denial', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/orders/ecotrack/shipments/11'), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(response.status).toBe(403);
  });

  it('loads shipment detail with system freshness actor', async () => {
    const response = await GET(new NextRequest('http://localhost/api/orders/ecotrack/shipments/11'), {
      params: Promise.resolve({ id: '11' }),
    });

    expect(response.status).toBe(200);
    expect(loadEcotrackOrderDetailMock).toHaveBeenCalledWith(11, {
      email: null,
      name: 'ECOTRACK sync',
    });
    await expect(response.json()).resolves.toEqual({ item: { orderId: 11 } });
  });
});
