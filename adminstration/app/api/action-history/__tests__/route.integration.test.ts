import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { GET } from '../route';

const { requireOpsAccessMock, hasDbMock, getDbMock, listActionHistoryMock, toActionHistoryItemMock } = vi.hoisted(() => ({
  requireOpsAccessMock: vi.fn(),
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  listActionHistoryMock: vi.fn(),
  toActionHistoryItemMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({ hasDb: hasDbMock, getDb: getDbMock }));
vi.mock('../../../../lib/rbac', () => ({ requireOpsAccess: requireOpsAccessMock }));
vi.mock('../../../../lib/action-history', () => ({
  actionHistoryQuerySchema: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    search: z.string().trim().default(''),
    operation: z.enum(['all', 'create', 'update', 'delete']).default('all'),
    resource: z.enum(['all', 'products', 'orders', 'assets', 'brandsCategories', 'bulletin', 'stats']).default('all'),
    state: z.enum(['all', 'applied', 'undone']).default('all'),
    sortKey: z.enum(['operation', 'resource', 'createdBy', 'createdAt', 'isUndone']).default('createdAt'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  }),
  listActionHistory: listActionHistoryMock,
  toActionHistoryItem: toActionHistoryItemMock,
}));

describe('app/api/action-history/route', () => {
  beforeEach(() => {
    requireOpsAccessMock.mockReset();
    requireOpsAccessMock.mockResolvedValue(null);
    hasDbMock.mockReset();
    getDbMock.mockReset();
    listActionHistoryMock.mockReset();
    toActionHistoryItemMock.mockReset();
    toActionHistoryItemMock.mockImplementation((item) => ({ id: item.id, createdAt: item.createdAt.toISOString() }));
  });

  it('denies access when ops permission check fails', async () => {
    requireOpsAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const res = await GET(new NextRequest('http://localhost/api/action-history'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns empty history when db is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET(new NextRequest('http://localhost/api/action-history'));

    await expect(res.json()).resolves.toEqual({
      items: [],
      pagination: {
        page: 1,
        limit: 10,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
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

    const res = await GET(new NextRequest('http://localhost/api/action-history?page=2&limit=10&search=admin&operation=update&resource=products&state=undone&sortKey=isUndone&sortDirection=asc'));

    expect(listActionHistoryMock).toHaveBeenCalledWith(db, {
      page: 2,
      limit: 10,
      search: 'admin',
      operation: 'update',
      resource: 'products',
      state: 'undone',
      sortKey: 'isUndone',
      sortDirection: 'asc',
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
