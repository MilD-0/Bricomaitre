import { NextResponse } from 'next/server';
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
vi.mock('../../../../../../lib/action-history-effects', () => ({
  refreshActionHistoryConsumers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../../../../lib/auth', () => ({ auth: authMock }));
vi.mock('../../../../../../lib/rbac', () => ({ requireMutationAccess: requireMutationAccessMock }));
vi.mock('../../../../../../lib/action-history', () => ({
  ActionHistoryConflictError: class ActionHistoryConflictError extends Error {},
  applyHistoryAction: applyHistoryActionMock,
  getActionEntityConfig: getActionEntityConfigMock,
  toActionHistoryItem: toActionHistoryItemMock,
}));

describe('app/api/action-history/[id]/undo/route', () => {
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

  it('returns 404 when the action log does not exist', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });

    const res = await POST(
      new Request('http://localhost/api/action-history/9/undo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: '9' }),
      },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Action log not found' });
  });

  it('enforces resource write access before undoing', async () => {
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
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await POST(
      new Request('http://localhost/api/action-history/9/undo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: '9' }),
      },
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('undoes a tracked action', async () => {
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
      new Request('http://localhost/api/action-history/9/undo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: '9' }),
      },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('orders');
    expect(applyHistoryActionMock).toHaveBeenCalledWith(db, {
      actionLogId: 9,
      direction: 'undo',
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
      new Request('http://localhost/api/action-history/9/undo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: '9' }),
      },
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ error: 'This action cannot be undone.' });
  });

  it('returns 400 before querying for an invalid action id', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await POST(
      new Request('http://localhost/api/action-history/nope/undo', { method: 'POST' }),
      {
        params: Promise.resolve({ id: 'nope' }),
      },
    );

    expect(res.status).toBe(400);
    expect(getDbMock).not.toHaveBeenCalled();
  });
});
