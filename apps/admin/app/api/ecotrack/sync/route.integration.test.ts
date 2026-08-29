import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

const { requireOpsAccessMock, authMock, getLatestExportJobMock, startEcotrackSyncJobMock } =
  vi.hoisted(() => ({
    requireOpsAccessMock: vi.fn(),
    authMock: vi.fn(),
    getLatestExportJobMock: vi.fn(),
    startEcotrackSyncJobMock: vi.fn(),
  }));

vi.mock('../../../../lib/rbac', () => ({
  requireOpsAccess: requireOpsAccessMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/background-jobs', () => ({
  ADMIN_ECOTRACK_SYNC_QUEUE: 'admin-ecotrack-sync',
  getLatestExportJob: getLatestExportJobMock,
  startEcotrackSyncJob: startEcotrackSyncJobMock,
}));

describe('app/api/ecotrack/sync/route', () => {
  beforeEach(() => {
    requireOpsAccessMock.mockReset();
    authMock.mockReset();
    getLatestExportJobMock.mockReset();
    startEcotrackSyncJobMock.mockReset();

    requireOpsAccessMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com' } });
    getLatestExportJobMock.mockResolvedValue(null);
    startEcotrackSyncJobMock.mockResolvedValue({
      kind: 'started',
      job: { id: 'sync-1', status: 'queued' },
    });
  });

  it('returns the RBAC denial response', async () => {
    requireOpsAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/ecotrack/sync', { method: 'POST' }),
    );

    expect(response.status).toBe(403);
  });

  it('returns the latest sync job snapshot', async () => {
    getLatestExportJobMock.mockResolvedValue({ id: 'sync-9', status: 'running' });

    const response = await GET(new NextRequest('http://localhost/api/ecotrack/sync'));

    expect(response.status).toBe(200);
    expect(getLatestExportJobMock).toHaveBeenCalledWith('admin-ecotrack-sync', 'ops@example.com');
    await expect(response.json()).resolves.toEqual({ job: { id: 'sync-9', status: 'running' } });
  });

  it('queues a manual sync', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/ecotrack/sync', { method: 'POST' }),
    );

    expect(startEcotrackSyncJobMock).toHaveBeenCalledWith(
      'ops@example.com',
      'manual',
      { email: 'ops@example.com', name: null },
      expect.any(String),
    );
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      job: { id: 'sync-1', status: 'queued' },
    });
  });

  it('returns 429 when a sync is already running', async () => {
    startEcotrackSyncJobMock.mockResolvedValue({
      kind: 'busy',
      job: { id: 'sync-2', status: 'running' },
    });

    const response = await POST(
      new NextRequest('http://localhost/api/ecotrack/sync', { method: 'POST' }),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: 'Ecotrack sync is already running.',
      job: { id: 'sync-2', status: 'running' },
    });
  });
});
