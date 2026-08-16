import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, requireAppAccessMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireAppAccessMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireAppAccess: requireAppAccessMock,
}));

vi.mock('../../../../lib/server-cache', () => ({
  CACHE_TAGS: { productsMeta: 'products-meta' },
  createServerCache: ({ load }: { load: (...args: unknown[]) => unknown }) => load,
}));

describe('app/api/products/meta/route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAppAccessMock.mockResolvedValue(null);
  });

  it('returns 401 when app access is denied', async () => {
    requireAppAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    );

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns empty meta payload when the database is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ brands: [], categories: [] });
  });

  it('returns brand and category metadata', async () => {
    hasDbMock.mockReturnValue(true);

    const brandOrderByMock = vi.fn().mockResolvedValue([{ id: 1, name: 'Makita' }]);
    const categoryFromMock = vi
      .fn()
      .mockResolvedValue([{ id: 2, name: 'Drills', parentId: null, properties: [] }]);
    const brandFromMock = vi.fn(() => ({ orderBy: brandOrderByMock }));
    const selectMock = vi
      .fn()
      .mockReturnValueOnce({ from: brandFromMock })
      .mockReturnValueOnce({ from: categoryFromMock });

    getDbMock.mockReturnValue({ select: selectMock });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      brands: [{ id: 1, name: 'Makita' }],
      categories: [{ id: 2, name: 'Drills', parentId: null, properties: [] }],
    });
  });
});
