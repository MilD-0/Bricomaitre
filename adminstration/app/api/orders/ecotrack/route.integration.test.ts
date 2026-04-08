import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, POST } from './route';

const {
  hasDbMock,
  authMock,
  requireMutationAccessMock,
  getLatestExportJobMock,
  getJobSnapshotMock,
  startOrderEcotrackJobMock,
  cancelExportJobMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  getLatestExportJobMock: vi.fn(),
  getJobSnapshotMock: vi.fn(),
  startOrderEcotrackJobMock: vi.fn(),
  cancelExportJobMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../lib/background-jobs', () => ({
  ADMIN_ORDER_ECOTRACK_QUEUE: 'admin-order-ecotrack',
  getLatestExportJob: getLatestExportJobMock,
  startOrderEcotrackJob: startOrderEcotrackJobMock,
  cancelExportJob: cancelExportJobMock,
}));

vi.mock('@bric/runtime/jobs', () => ({
  getJobSnapshot: getJobSnapshotMock,
}));

describe('app/api/orders/ecotrack/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    getLatestExportJobMock.mockReset();
    getJobSnapshotMock.mockReset();
    startOrderEcotrackJobMock.mockReset();
    cancelExportJobMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { id: 'user-1', email: 'ops@example.com', name: 'Ops' } });
    requireMutationAccessMock.mockResolvedValue(null);
    getLatestExportJobMock.mockResolvedValue(null);
    startOrderEcotrackJobMock.mockResolvedValue({
      kind: 'started',
      job: { id: 'eco-1', status: 'queued', progress: { phase: 'loading', current: 0, total: 1, percentage: 0 }, resultSummary: null },
    });
    cancelExportJobMock.mockResolvedValue({ id: 'eco-1', status: 'cancelled' });
  });

  it('returns RBAC denial', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await POST(new Request('http://localhost/api/orders/ecotrack', { method: 'POST' }));

    expect(response.status).toBe(403);
  });

  it('returns 503 when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET(new Request('http://localhost/api/orders/ecotrack'));

    expect(response.status).toBe(503);
  });

  it('returns the latest posting job', async () => {
    getLatestExportJobMock.mockResolvedValue({ id: 'eco-9', status: 'running' });

    const response = await GET(new Request('http://localhost/api/orders/ecotrack'));

    expect(response.status).toBe(200);
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-order-ecotrack', 'user-1');
    await expect(response.json()).resolves.toEqual({ job: { id: 'eco-9', status: 'running' } });
  });

  it('returns a specific owned job when jobId is provided', async () => {
    getJobSnapshotMock.mockResolvedValue({ id: 'eco-9', status: 'running', ownerKey: 'user-1' });

    const response = await GET(new Request('http://localhost/api/orders/ecotrack?jobId=eco-9'));

    expect(response.status).toBe(200);
    expect(getJobSnapshotMock).toHaveBeenCalledWith('admin-order-ecotrack', 'eco-9');
    await expect(response.json()).resolves.toEqual({ job: { id: 'eco-9', status: 'running', ownerKey: 'user-1' } });
  });

  it('returns 404 for non-owned job snapshots', async () => {
    getJobSnapshotMock.mockResolvedValue({ id: 'eco-9', status: 'running', ownerKey: 'other-user' });

    const response = await GET(new Request('http://localhost/api/orders/ecotrack?jobId=eco-9'));

    expect(response.status).toBe(404);
  });

  it('starts a posting job', async () => {
    const response = await POST(new Request('http://localhost/api/orders/ecotrack', {
      method: 'POST',
      body: JSON.stringify({ mode: 'selected', orderIds: [11, '12', 12] }),
    }));

    expect(startOrderEcotrackJobMock).toHaveBeenCalledWith('user-1', {
      mode: 'selected',
      orderIds: [11, 12],
      actor: { email: 'ops@example.com', name: 'Ops' },
    }, expect.any(String));
    expect(response.status).toBe(201);
  });

  it('returns busy queue behavior', async () => {
    startOrderEcotrackJobMock.mockResolvedValue({
      kind: 'busy',
      job: { id: 'eco-2', status: 'running' },
    });

    const response = await POST(new Request('http://localhost/api/orders/ecotrack', {
      method: 'POST',
      body: JSON.stringify({ mode: 'selected', orderIds: [11] }),
    }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Ecotrack posting is already running.',
      job: { id: 'eco-2', status: 'running' },
    });
  });

  it('cancels the running job', async () => {
    const response = await DELETE(new Request('http://localhost/api/orders/ecotrack', { method: 'DELETE' }));

    expect(cancelExportJobMock).toHaveBeenCalledWith('admin-order-ecotrack', 'user-1');
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ job: { id: 'eco-1', status: 'cancelled' } });
  });
});
