import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, POST } from '../route';

const { hasDbMock, requireOpsAccessMock, listAdCostsMock, upsertAdCostEntryMock, deleteAdCostEntryMock, authMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireOpsAccessMock: vi.fn(),
  listAdCostsMock: vi.fn(),
  upsertAdCostEntryMock: vi.fn(),
  deleteAdCostEntryMock: vi.fn(),
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
    listAdCosts: listAdCostsMock,
    upsertAdCostEntry: upsertAdCostEntryMock,
    deleteAdCostEntry: deleteAdCostEntryMock,
  };
});

describe('app/api/stats/ad-costs/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    requireOpsAccessMock.mockReset();
    listAdCostsMock.mockReset();
    upsertAdCostEntryMock.mockReset();
    deleteAdCostEntryMock.mockReset();
    authMock.mockReset();

    hasDbMock.mockReturnValue(true);
    requireOpsAccessMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
  });

  it('returns filtered ad costs', async () => {
    listAdCostsMock.mockResolvedValue([{ id: '1', spend: 1200 }]);

    const response = await GET(new NextRequest('http://localhost/api/stats/ad-costs?range=30d'));

    expect(response.status).toBe(200);
    expect(listAdCostsMock).toHaveBeenCalledWith({ range: '30d' });
    await expect(response.json()).resolves.toEqual({ data: [{ id: '1', spend: 1200 }] });
  });

  it('rejects invalid POST payloads', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/stats/ad-costs', {
        method: 'POST',
        body: JSON.stringify({ date: 'bad-date' }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('creates or updates an ad-cost entry', async () => {
    upsertAdCostEntryMock.mockResolvedValue({ id: 3, created: true });

    const response = await POST(
      new NextRequest('http://localhost/api/stats/ad-costs', {
        method: 'POST',
        body: JSON.stringify({
          date: '2026-03-30',
          platform: 'facebook',
          campaignName: 'Prospecting',
          spend: 1200,
        }),
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    expect(response.status).toBe(200);
    expect(upsertAdCostEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignName: 'Prospecting',
        date: '2026-03-30',
        platform: 'facebook',
        spend: 1200,
      }),
      { email: 'ops@example.com', name: 'Ops' },
    );
    await expect(response.json()).resolves.toEqual({ data: { id: 3, created: true } });
  });

  it('deletes an ad-cost entry', async () => {
    deleteAdCostEntryMock.mockResolvedValue({ id: 3 });

    const response = await DELETE(new NextRequest('http://localhost/api/stats/ad-costs?id=3', { method: 'DELETE' }));

    expect(response.status).toBe(200);
    expect(deleteAdCostEntryMock).toHaveBeenCalledWith('3', { email: 'ops@example.com', name: 'Ops' });
    await expect(response.json()).resolves.toEqual({ data: { id: 3 } });
  });

  it('returns the RBAC denial response', async () => {
    requireOpsAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/stats/ad-costs?range=30d'));

    expect(response.status).toBe(403);
  });
});
