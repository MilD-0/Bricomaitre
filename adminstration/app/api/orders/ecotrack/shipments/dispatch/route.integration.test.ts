import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const {
  hasDbMock,
  authMock,
  requireMutationAccessMock,
  dispatchEcotrackOrdersBatchMock,
  parseEcotrackBulkDispatchRequestMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  dispatchEcotrackOrdersBatchMock: vi.fn(),
  parseEcotrackBulkDispatchRequestMock: vi.fn(),
}));

vi.mock('../../../../../../db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../../lib/admin-ecotrack-orders-data', () => ({
  parseEcotrackBulkDispatchRequest: parseEcotrackBulkDispatchRequestMock,
  dispatchEcotrackOrdersBatch: dispatchEcotrackOrdersBatchMock,
}));

describe('app/api/orders/ecotrack/shipments/dispatch/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    dispatchEcotrackOrdersBatchMock.mockReset();
    parseEcotrackBulkDispatchRequestMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    requireMutationAccessMock.mockResolvedValue(null);
    parseEcotrackBulkDispatchRequestMock.mockReturnValue({ orderIds: [11, 12], askCollection: false });
  });

  it('returns RBAC denial', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await POST(new NextRequest('http://localhost/api/orders/ecotrack/shipments/dispatch', { method: 'POST' }));

    expect(response.status).toBe(403);
  });

  it('returns structured partial-success dispatch results', async () => {
    dispatchEcotrackOrdersBatchMock.mockResolvedValue({
      ok: true,
      items: [{ orderId: 11 }],
      failures: [{ orderId: 12, reference: '12', trackingNumber: 'TRK-12', message: 'Order #12 failed.' }],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
    });

    const response = await POST(new NextRequest('http://localhost/api/orders/ecotrack/shipments/dispatch', {
      method: 'POST',
      body: JSON.stringify({ orderIds: [11, 12], askCollection: false }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      items: [{ orderId: 11 }],
      failures: [{ orderId: 12, reference: '12', trackingNumber: 'TRK-12', message: 'Order #12 failed.' }],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
    });
  });
});
