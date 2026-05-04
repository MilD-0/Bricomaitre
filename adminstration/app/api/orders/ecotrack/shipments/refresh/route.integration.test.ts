import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const {
  hasDbMock,
  authMock,
  requireMutationAccessMock,
  refreshEcotrackOrdersBatchMock,
  parseEcotrackBulkActionMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  refreshEcotrackOrdersBatchMock: vi.fn(),
  parseEcotrackBulkActionMock: vi.fn(),
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
  parseEcotrackBulkAction: parseEcotrackBulkActionMock,
  refreshEcotrackOrdersBatch: refreshEcotrackOrdersBatchMock,
}));

describe('app/api/orders/ecotrack/shipments/refresh/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    refreshEcotrackOrdersBatchMock.mockReset();
    parseEcotrackBulkActionMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    requireMutationAccessMock.mockResolvedValue(null);
    parseEcotrackBulkActionMock.mockReturnValue({ orderIds: [11, 12] });
  });

  it('returns RBAC denial', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await POST(new NextRequest('http://localhost/api/orders/ecotrack/shipments/refresh', { method: 'POST' }));

    expect(response.status).toBe(403);
  });

  it('returns a structured full-success response', async () => {
    refreshEcotrackOrdersBatchMock.mockResolvedValue({
      ok: true,
      items: [{ orderId: 11 }],
      failures: [],
      successCount: 2,
      failureCount: 0,
      totalRequested: 2,
    });

    const response = await POST(new NextRequest('http://localhost/api/orders/ecotrack/shipments/refresh', {
      method: 'POST',
      body: JSON.stringify({ orderIds: [11, 12] }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      items: [{ orderId: 11 }],
      failures: [],
      successCount: 2,
      failureCount: 0,
      totalRequested: 2,
    });
  });

  it('returns a structured partial-success response', async () => {
    refreshEcotrackOrdersBatchMock.mockResolvedValue({
      ok: true,
      items: [{ orderId: 12 }],
      failures: [{ orderId: 11, trackingNumber: 'TRK-11', message: 'MAJ failed' }],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
    });

    const response = await POST(new NextRequest('http://localhost/api/orders/ecotrack/shipments/refresh', {
      method: 'POST',
      body: JSON.stringify({ orderIds: [11, 12] }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      items: [{ orderId: 12 }],
      failures: [{ orderId: 11, trackingNumber: 'TRK-11', message: 'MAJ failed' }],
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
    });
  });

  it('returns validation errors for invalid payloads', async () => {
    parseEcotrackBulkActionMock.mockImplementation(() => {
      throw new Error('Invalid payload');
    });

    const response = await POST(new NextRequest('http://localhost/api/orders/ecotrack/shipments/refresh', {
      method: 'POST',
      body: JSON.stringify({ orderIds: [] }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid payload' });
  });

  it('returns a structured total-failure response', async () => {
    refreshEcotrackOrdersBatchMock.mockResolvedValue({
      ok: false,
      items: [],
      failures: [{ orderId: 11, trackingNumber: 'TRK-11', message: 'Status fetch failed' }],
      successCount: 0,
      failureCount: 1,
      totalRequested: 1,
    });

    const response = await POST(new NextRequest('http://localhost/api/orders/ecotrack/shipments/refresh', {
      method: 'POST',
      body: JSON.stringify({ orderIds: [11] }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      items: [],
      failures: [{ orderId: 11, trackingNumber: 'TRK-11', message: 'Status fetch failed' }],
      successCount: 0,
      failureCount: 1,
      totalRequested: 1,
    });
  });
});
