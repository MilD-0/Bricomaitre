import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyHistory: vi.fn(),
  listHistory: vi.fn(),
  loadDetail: vi.fn(),
  toListItem: vi.fn((entry: { id: number }) => ({
    id: entry.id,
    resource: 'products',
    entityType: 'products',
    entityId: 12,
    entityLabel: 'Perceuse',
    operation: 'update',
    isReversible: true,
    isUndone: false,
    changeCount: 1,
    changePreview: [{ key: 'price', kind: 'field', field: 'price' }],
    semanticChangeCount: 1,
    createdAt: '2026-08-24T08:00:00.000Z',
  })),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./rbac', () => ({
  canMutateResource: (permissions: string[], resource: string) =>
    permissions.includes(`${resource}_write`),
}));
vi.mock('./action-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./action-history')>()),
  applyHistoryAction: mocks.applyHistory,
  listActionHistory: mocks.listHistory,
  loadActionHistoryDetail: mocks.loadDetail,
  toActionHistoryListItem: mocks.toListItem,
}));

import {
  inspectAdminAiActionHistory,
  recoverAdminAiActionHistory,
} from './admin-ai-action-history';

function detail(overrides: Record<string, unknown> = {}) {
  return {
    item: {
      id: 44,
      resource: 'products',
      entityType: 'products',
      entityId: 12,
      entityLabel: 'Perceuse',
      operation: 'update',
      createdBy: 'editor@bricomaitre.com',
      createdByName: 'Editor',
      isReversible: true,
      isUndone: false,
      changes: [{ key: 'price', field: 'price', before: '15000', after: '14900' }],
      createdAt: '2026-08-24T08:00:00.000Z',
      undoneAt: null,
      redoneAt: null,
      ...overrides,
    },
    recovery: { nextAction: 'undo', blockedReason: null },
  };
}

describe('admin AI action-history inspection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the native filters and annotates visible actions with permission-aware recovery', async () => {
    mocks.listHistory.mockResolvedValue({
      items: [{ id: 44 }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });
    mocks.loadDetail.mockResolvedValue(detail());

    await expect(
      inspectAdminAiActionHistory(
        {
          scope: 'filtered',
          page: 1,
          limit: 20,
          search: 'Perceuse',
          operation: 'update',
          resource: 'products',
          state: 'applied',
          includeEcotrackSync: false,
          sortKey: 'createdAt',
          sortDirection: 'desc',
        },
        ['settings_manage'],
      ),
    ).resolves.toMatchObject({
      items: [
        {
          id: 44,
          recovery: { nextAction: null, blockedReason: 'permission_required' },
        },
      ],
    });
    expect(mocks.listHistory).toHaveBeenCalledWith(
      'database',
      expect.objectContaining({
        search: 'Perceuse',
        resource: 'products',
        state: 'applied',
        includeEcotrackSync: false,
      }),
    );
  });

  it('returns full exact before/after changes and the currently valid recovery direction', async () => {
    mocks.loadDetail.mockResolvedValueOnce(detail()).mockResolvedValueOnce(null);

    await expect(
      inspectAdminAiActionHistory({ scope: 'exact', actionLogIds: [44, 45, 44] }, [
        'settings_manage',
        'products_write',
      ]),
    ).resolves.toMatchObject({
      requestedCount: 2,
      items: [
        {
          id: 44,
          changes: [{ field: 'price', before: '15000', after: '14900' }],
          recovery: { nextAction: 'undo', blockedReason: null },
        },
      ],
      failures: [{ actionLogId: 45, message: 'Action log #45 was not found.' }],
    });
  });
});

describe('admin AI action-history recovery', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revalidates recovery and permissions, applies it canonically, and reloads persisted state', async () => {
    mocks.loadDetail
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ isUndone: true, undoneAt: '2026-08-24T09:00:00.000Z' }));
    mocks.applyHistory.mockResolvedValue({ id: 44, isUndone: true });

    await expect(
      recoverAdminAiActionHistory(
        { items: [{ actionLogId: 44, direction: 'undo' }] },
        {
          permissions: ['settings_manage', 'products_write'],
          actor: { email: 'admin@bricomaitre.com', name: 'Admin' },
        },
      ),
    ).resolves.toMatchObject({
      ok: true,
      successCount: 1,
      items: [{ id: 44, direction: 'undo', isUndone: true }],
    });
    expect(mocks.applyHistory).toHaveBeenCalledWith('database', {
      actionLogId: 44,
      direction: 'undo',
      actor: { email: 'admin@bricomaitre.com', name: 'Admin' },
    });
  });

  it('preserves per-action permission and ordering failures without applying them', async () => {
    mocks.loadDetail.mockResolvedValueOnce(detail()).mockResolvedValueOnce({
      ...detail(),
      recovery: { nextAction: null, blockedReason: 'newer_action' },
    });

    await expect(
      recoverAdminAiActionHistory(
        {
          items: [
            { actionLogId: 44, direction: 'undo' },
            { actionLogId: 45, direction: 'undo' },
          ],
        },
        { permissions: ['settings_manage'], actor: { email: 'admin@bricomaitre.com' } },
      ),
    ).resolves.toMatchObject({
      ok: false,
      failureCount: 2,
      failures: [
        { actionLogId: 44, message: 'Permission is required to mutate products.' },
        { actionLogId: 45, message: 'Permission is required to mutate products.' },
      ],
    });
    expect(mocks.applyHistory).not.toHaveBeenCalled();
  });
});
