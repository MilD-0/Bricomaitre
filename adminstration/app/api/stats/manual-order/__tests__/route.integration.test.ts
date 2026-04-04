import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from '../route';

const { hasDbMock, requireOpsAccessMock, createManualOrderMock, listManualOrdersMock, authMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireOpsAccessMock: vi.fn(),
  createManualOrderMock: vi.fn(),
  listManualOrdersMock: vi.fn(),
  authMock: vi.fn(),
}));

vi.mock('../../../../../db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireOpsAccess: requireOpsAccessMock,
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/stats', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/stats')>('../../../../../lib/stats');

  return {
    ...actual,
    createManualOrder: createManualOrderMock,
    listManualOrders: listManualOrdersMock,
  };
});

describe('app/api/stats/manual-order/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    requireOpsAccessMock.mockReset();
    createManualOrderMock.mockReset();
    listManualOrdersMock.mockReset();
    authMock.mockReset();

    hasDbMock.mockReturnValue(true);
    requireOpsAccessMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
  });

  it('blocks GET when ops access is denied', async () => {
    requireOpsAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it('returns manual orders', async () => {
    listManualOrdersMock.mockResolvedValue({
      data: [{ id: '1', tracking: 'MANUAL-1' }],
      pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: '1', tracking: 'MANUAL-1' }],
      pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
  });

  it('rejects invalid manual-order payloads', async () => {
    const request = new NextRequest('http://localhost/api/stats/manual-order', {
      method: 'POST',
      body: JSON.stringify({ tracking: '' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('creates a manual order', async () => {
    createManualOrderMock.mockResolvedValue({ id: 1, tracking: 'MANUAL-1' });

    const request = new NextRequest('http://localhost/api/stats/manual-order', {
      method: 'POST',
      body: JSON.stringify({
        tracking: 'MANUAL-1',
        amountCollected: 1200,
        feeBreakdown: {
          livraison: 100,
          poids: 0,
          extra: 0,
          sms: 0,
          stockage: 0,
          commission: 0,
        },
        products: [],
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(createManualOrderMock).toHaveBeenCalledWith(
      expect.any(Object),
      { email: 'ops@example.com', name: 'Ops' },
    );
    await expect(response.json()).resolves.toEqual({ data: { id: 1, tracking: 'MANUAL-1' } });
  });
});
