import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../route';

const {
  hasDbMock,
  getDbMock,
  requireMutationAccessMock,
  authMock,
  applyHistoryActionMock,
  getActionEntityConfigMock,
  toActionHistoryItemMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  applyHistoryActionMock: vi.fn(),
  getActionEntityConfigMock: vi.fn(),
  toActionHistoryItemMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock, getDb: getDbMock }));
vi.mock('@bric/db/schema', () => ({ actionLogs: { id: 'id' } }));
vi.mock('../../../../../../lib/auth', () => ({ auth: authMock }));
vi.mock('../../../../../../lib/rbac', () => ({ requireMutationAccess: requireMutationAccessMock }));
vi.mock('../../../../../../lib/action-history', () => ({
  ActionHistoryConflictError: class ActionHistoryConflictError extends Error {},
  applyHistoryAction: applyHistoryActionMock,
  getActionEntityConfig: getActionEntityConfigMock,
  toActionHistoryItem: toActionHistoryItemMock,
}));

describe('app/api/action-history/[id]/redo/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    applyHistoryActionMock.mockReset();
    applyHistoryActionMock.mockResolvedValue({
      id: 1,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
    });
    getActionEntityConfigMock.mockReset();
    getActionEntityConfigMock.mockReturnValue({ resource: 'orders' });
    toActionHistoryItemMock.mockReset();
    toActionHistoryItemMock.mockReturnValue({ id: 1, createdAt: '2026-03-21T00:00:00.000Z' });
  });

  it('redoes a tracked action', async () => {
    hasDbMock.mockReturnValue(true);
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: 9, entityType: 'orders', isReversible: true }]),
          }),
        }),
      }),
    };
    getDbMock.mockReturnValue(db);

    const res = await POST(
      new Request('http://localhost/api/action-history/9/redo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: '9' }),
      },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('orders');
    expect(applyHistoryActionMock).toHaveBeenCalledWith(db, {
      actionLogId: 9,
      direction: 'redo',
      actor: { email: 'admin@example.com', name: 'Admin' },
    });
    await expect(res.json()).resolves.toEqual({
      ok: true,
      item: { id: 1, createdAt: '2026-03-21T00:00:00.000Z' },
    });
  });

  it('returns 409 for non-reversible entries', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () =>
              Promise.resolve([{ id: 9, entityType: 'ecotrackShipments', isReversible: false }]),
          }),
        }),
      }),
    });

    const res = await POST(
      new Request('http://localhost/api/action-history/9/redo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: '9' }),
      },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'This action cannot be redone.' });
  });

  it('returns 400 before querying for an invalid action id', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await POST(
      new Request('http://localhost/api/action-history/nope/redo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: 'nope' }),
      },
    );

    expect(res.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('returns 500 for an unexpected persistence failure', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([{ id: 9, entityType: 'orders', isReversible: true }]),
          }),
        }),
      }),
    });
    applyHistoryActionMock.mockRejectedValue(new Error('database unavailable'));

    const res = await POST(
      new Request('http://localhost/api/action-history/9/redo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: '9' }),
      },
    );

    expect(res.status).toBe(500);
  });
});
