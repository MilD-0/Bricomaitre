import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  canMutateResource: vi.fn(),
  getActionEntityConfig: vi.fn(),
  getDb: vi.fn(),
  hasDb: vi.fn(),
  loadDetail: vi.fn(),
  requireSettingsAccess: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: mocks.getDb, hasDb: mocks.hasDb }));
vi.mock('../../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../lib/rbac', () => ({
  canMutateResource: mocks.canMutateResource,
  requireSettingsAccess: mocks.requireSettingsAccess,
}));
vi.mock('../../../../../lib/action-history', () => ({
  getActionEntityConfig: mocks.getActionEntityConfig,
  loadActionHistoryDetail: mocks.loadDetail,
}));

const detail = {
  item: { id: 9, entityType: 'orders', entityLabel: 'Order 9', resource: 'orders' },
  recovery: { nextAction: 'undo', blockedReason: null },
};

describe('app/api/action-history/[id]/route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSettingsAccess.mockImplementation(async () => ({
      response: null,
      session: await mocks.auth(),
    }));
    mocks.hasDb.mockReturnValue(true);
    mocks.getDb.mockReturnValue({ marker: 'db' });
    mocks.loadDetail.mockResolvedValue(detail);
    mocks.auth.mockResolvedValue({ user: { permissions: ['orders_write'] } });
    mocks.getActionEntityConfig.mockReturnValue({ resource: 'orders' });
    mocks.canMutateResource.mockReturnValue(true);
  });

  it('requires settings access before reading history details', async () => {
    mocks.requireSettingsAccess.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));
    const response = await GET(new Request('http://localhost/api/action-history/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(response.status).toBe(403);
    expect(mocks.loadDetail).not.toHaveBeenCalled();
  });

  it('returns complete detail and an available recovery action', async () => {
    const response = await GET(new Request('http://localhost/api/action-history/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    await expect(response.json()).resolves.toEqual(detail);
    expect(mocks.loadDetail).toHaveBeenCalledWith({ marker: 'db' }, 9);
    expect(mocks.canMutateResource).toHaveBeenCalledWith(['orders_write'], 'orders');
  });

  it('withholds recovery when the viewer lacks the resource permission', async () => {
    mocks.canMutateResource.mockReturnValue(false);
    const response = await GET(new Request('http://localhost/api/action-history/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    await expect(response.json()).resolves.toEqual({
      item: detail.item,
      recovery: { nextAction: null, blockedReason: 'permission_required' },
    });
  });

  it('rejects malformed and missing action ids', async () => {
    const malformed = await GET(new Request('http://localhost/api/action-history/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(malformed.status).toBe(400);

    mocks.loadDetail.mockResolvedValueOnce(null);
    const missing = await GET(new Request('http://localhost/api/action-history/99'), {
      params: Promise.resolve({ id: '99' }),
    });
    expect(missing.status).toBe(404);
  });
});
