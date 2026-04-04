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

vi.mock('../../../../../../db/client', () => ({ hasDb: hasDbMock, getDb: getDbMock }));
vi.mock('../../../../../../db/schema', () => ({ actionLogs: { id: 'id' } }));
vi.mock('../../../../../../lib/auth', () => ({ auth: authMock }));
vi.mock('../../../../../../lib/rbac', () => ({ requireMutationAccess: requireMutationAccessMock }));
vi.mock('../../../../../../lib/action-history', () => ({
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
    applyHistoryActionMock.mockResolvedValue({ id: 1, createdAt: new Date('2026-03-21T00:00:00.000Z') });
    getActionEntityConfigMock.mockReset();
    getActionEntityConfigMock.mockReturnValue({ resource: 'orders' });
    toActionHistoryItemMock.mockReset();
    toActionHistoryItemMock.mockReturnValue({ id: 1, createdAt: '2026-03-21T00:00:00.000Z' });
  });

  it('redoes a tracked action', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 9, entityType: 'orders' }]) }) }) }) };
    getDbMock.mockReturnValue(db);

    const res = await POST(new Request('http://localhost/api/action-history/9/redo', { method: 'POST' }), {
      params: Promise.resolve({ id: '9' }),
    });

    expect(requireMutationAccessMock).toHaveBeenCalledWith('orders');
    expect(applyHistoryActionMock).toHaveBeenCalledWith(db, {
      actionLogId: 9,
      direction: 'redo',
      actor: { email: 'admin@example.com', name: 'Admin' },
    });
    await expect(res.json()).resolves.toEqual({ ok: true, item: { id: 1, createdAt: '2026-03-21T00:00:00.000Z' } });
  });
});
