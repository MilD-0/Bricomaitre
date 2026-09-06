import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const {
  requireSettingsAccessMock,
  hasDbMock,
  getDbMock,
  listActionHistoryMock,
  toActionHistoryListItemMock,
} = vi.hoisted(() => ({
  requireSettingsAccessMock: vi.fn(),
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  listActionHistoryMock: vi.fn(),
  toActionHistoryListItemMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock, getDb: getDbMock }));
vi.mock('../../../../lib/rbac', () => ({ requireSettingsAccess: requireSettingsAccessMock }));
vi.mock('../../../../lib/action-history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/action-history')>()),
  listActionHistory: listActionHistoryMock,
  toActionHistoryListItem: toActionHistoryListItemMock,
}));

describe('app/api/action-history/route', () => {
  beforeEach(() => {
    requireSettingsAccessMock.mockReset();
    requireSettingsAccessMock.mockResolvedValue(null);
    hasDbMock.mockReset();
    getDbMock.mockReset();
    listActionHistoryMock.mockReset();
    toActionHistoryListItemMock.mockReset();
    toActionHistoryListItemMock.mockImplementation((item) => ({
      id: item.id,
      createdAt: item.createdAt.toISOString(),
    }));
  });

  it('denies access when settings permission check fails', async () => {
    requireSettingsAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const res = await GET(new NextRequest('http://localhost/api/action-history'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('reports unavailable storage without claiming the history is empty', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/api/action-history'));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns 400 for malformed list queries', async () => {
    const res = await GET(new NextRequest('http://localhost/api/action-history?page=0'));

    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('error');
    expect(hasDbMock).not.toHaveBeenCalled();
  });

  it('returns serialized action history items', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);
    listActionHistoryMock.mockResolvedValue({
      items: [{ id: 1, createdAt: new Date('2026-03-21T00:00:00.000Z') }],
      pagination: {
        page: 2,
        limit: 10,
        totalItems: 12,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });

    const res = await GET(
      new NextRequest(
        'http://localhost/api/action-history?page=2&limit=10&search=admin&operation=update&resource=products&state=undone&includeEcotrackSync=true&sort=isUndone:asc&sort=createdAt:desc',
      ),
    );

    expect(listActionHistoryMock).toHaveBeenCalledWith(db, {
      page: 2,
      limit: 10,
      search: 'admin',
      operation: 'update',
      resource: 'products',
      state: 'undone',
      includeEcotrackSync: true,
      sort: ['isUndone:asc', 'createdAt:desc'],
      sortKey: 'createdAt',
      sortDirection: 'desc',
      sortRules: [
        { key: 'isUndone', direction: 'asc' },
        { key: 'createdAt', direction: 'desc' },
      ],
    });
    await expect(res.json()).resolves.toEqual({
      items: [{ id: 1, createdAt: '2026-03-21T00:00:00.000Z' }],
      pagination: {
        page: 2,
        limit: 10,
        totalItems: 12,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });
});
