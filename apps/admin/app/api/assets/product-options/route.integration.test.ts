import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), search: vi.fn() }));
vi.mock('../../../../lib/rbac', () => ({ requireMutationAccess: mocks.access }));
vi.mock('../../../../lib/admin-assets-data', () => ({ searchAssetProductOptions: mocks.search }));

import { GET } from './route';

describe('asset product options route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue(null);
    mocks.search.mockResolvedValue({ items: [{ id: 9 }], page: 2, limit: 10, total: 21 });
  });

  it('supports paginated search with a minimal response', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/assets/product-options?search=drill&page=2&limit=10'),
    );
    expect(mocks.search).toHaveBeenCalledWith({ search: 'drill', ids: [], page: 2, limit: 10 });
    await expect(response.json()).resolves.toEqual({
      items: [{ id: 9 }],
      page: 2,
      limit: 10,
      total: 21,
      hasMore: true,
    });
  });

  it('hydrates selected ids and rejects malformed identifiers', async () => {
    await GET(new NextRequest('http://localhost/api/assets/product-options?ids=8,3'));
    expect(mocks.search).toHaveBeenLastCalledWith({ search: '', ids: [8, 3], page: 1, limit: 20 });

    const invalid = await GET(
      new NextRequest('http://localhost/api/assets/product-options?ids=8,nope'),
    );
    expect(invalid.status).toBe(400);
  });

  it('requires asset access', async () => {
    mocks.access.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const response = await GET(new NextRequest('http://localhost/api/assets/product-options'));
    expect(response.status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
