import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as undo } from './[id]/undo/route';
import { POST as redo } from './[id]/redo/route';
import { ActionHistoryConflictError } from '@/lib/action-history';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  hasDb: vi.fn(),
  getDb: vi.fn(),
  entries: vi.fn(),
  apply: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@bric/db/client', () => ({ getDb: mocks.getDb, hasDb: mocks.hasDb }));
vi.mock('@/lib/action-history-effects', () => ({
  refreshActionHistoryConsumers: mocks.refresh,
}));
vi.mock('@/lib/action-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/action-history')>()),
  applyHistoryAction: mocks.apply,
}));
const db = { select: () => ({ from: () => ({ where: () => ({ limit: mocks.entries }) }) }) };
const actor = { email: 'operator@example.test', name: 'Operator' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    user: { ...actor, isAllowed: true, permissions: ['orders_write'] },
  });
  mocks.hasDb.mockReturnValue(true);
  mocks.getDb.mockReturnValue(db);
  mocks.entries.mockResolvedValue([{ entityType: 'orders', isReversible: true }]);
  mocks.apply.mockResolvedValue({ id: 9, createdAt: new Date('2026-09-01'), undoneAt: null });
});

describe.each([
  ['undo', undo],
  ['redo', redo],
] as const)('%s history route', (direction, handler) => {
  const invoke = (id = '9') =>
    handler(
      new Request(`http://localhost/api/action-history/${id}/${direction}`, { method: 'POST' }),
      {
        params: Promise.resolve({ id }),
      },
    );
  it.each([null, { user: { isAllowed: false, permissions: ['orders_write'] } }])(
    'denies unavailable access before reading entries',
    async (session) => {
      mocks.auth.mockResolvedValue(session);
      expect((await invoke()).status).toBe(session ? 403 : 401);
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(mocks.apply).not.toHaveBeenCalled();
    },
  );
  it('uses resource permissions independently of the displayed role', async () => {
    mocks.auth.mockResolvedValue({
      user: { ...actor, role: 'admin', isAllowed: true, permissions: ['settings_manage'] },
    });
    expect((await invoke()).status).toBe(403);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it('recovers the exact entry with the actor and refreshes its resource', async () => {
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      item: { id: 9, createdAt: '2026-09-01T00:00:00.000Z' },
    });
    expect(mocks.apply).toHaveBeenCalledWith(db, { actionLogId: 9, direction, actor });
    expect(mocks.refresh).toHaveBeenCalledWith('orders');
    expect(mocks.auth).toHaveBeenCalledOnce();
  });
  it('rejects malformed, missing and nonreversible entries without mutation', async () => {
    expect((await invoke('invalid')).status).toBe(400);
    expect(mocks.getDb).not.toHaveBeenCalled();
    mocks.entries.mockResolvedValueOnce([]);
    expect((await invoke()).status).toBe(404);
    mocks.entries.mockResolvedValueOnce([{ entityType: 'orders', isReversible: false }]);
    expect((await invoke()).status).toBe(409);
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it.each([
    [new ActionHistoryConflictError('Changed since this action'), 409],
    [new Error('Persistence unavailable'), 500],
  ])('reports recovery failure without refreshing consumers', async (error, status) => {
    mocks.apply.mockRejectedValue(error);
    expect((await invoke()).status).toBe(status);
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
