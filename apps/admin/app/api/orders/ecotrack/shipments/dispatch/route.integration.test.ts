import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const { hasDbMock, authMock, requireMutationAccessMock, dispatchEcotrackOrdersBatchMock } =
  vi.hoisted(() => ({
    hasDbMock: vi.fn(),
    authMock: vi.fn(),
    requireMutationAccessMock: vi.fn(),
    dispatchEcotrackOrdersBatchMock: vi.fn(),
  }));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../../lib/admin-ecotrack-orders-data', async (original) => ({
  ...(await original<typeof import('../../../../../../lib/admin-ecotrack-orders-data')>()),
  dispatchEcotrackOrdersBatch: dispatchEcotrackOrdersBatchMock,
}));

describe('app/api/orders/ecotrack/shipments/dispatch/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    dispatchEcotrackOrdersBatchMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
  });

  it('returns RBAC denial', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const response = await POST(
      new NextRequest('http://localhost/api/orders/ecotrack/shipments/dispatch', {
        method: 'POST',
      }),
    );

    expect(response.status).toBe(403);
  });

  it('returns structured partial-success dispatch results', async () => {
    dispatchEcotrackOrdersBatchMock.mockResolvedValue({
      ok: true,
      items: [{ orderId: 11 }],
      failures: [
        { orderId: 12, reference: '12', trackingNumber: 'TRK-12', message: 'Order #12 failed.' },
      ],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
    });

    const response = await POST(
      new NextRequest('http://localhost/api/orders/ecotrack/shipments/dispatch', {
        method: 'POST',
        body: JSON.stringify({ orderIds: [11, 12], askCollection: false }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      items: [{ orderId: 11 }],
      failures: [
        { orderId: 12, reference: '12', trackingNumber: 'TRK-12', message: 'Order #12 failed.' },
      ],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
    });
  });
});
