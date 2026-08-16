import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

const {
  hasDbMock,
  getDbMock,
  authMock,
  requireMutationAccessMock,
  readCategoriesPageMock,
  resolveCategorySlugMock,
  mutateEntityWithHistoryMock,
  revalidateStorefrontProductMetaMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  readCategoriesPageMock: vi.fn(),
  resolveCategorySlugMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  revalidateStorefrontProductMetaMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../lib/brands-categories-api', () => ({
  readCategoriesPage: readCategoriesPageMock,
  resolveCategorySlug: resolveCategorySlugMock,
}));

vi.mock('../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));
vi.mock('../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontProductMeta: revalidateStorefrontProductMetaMock,
}));

describe('app/api/categories/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    readCategoriesPageMock.mockReset();
    resolveCategorySlugMock.mockReset();
    mutateEntityWithHistoryMock.mockReset();
    revalidateStorefrontProductMetaMock.mockReset().mockResolvedValue(undefined);

    requireMutationAccessMock.mockResolvedValue(null);
    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    getDbMock.mockReturnValue({});
    resolveCategorySlugMock.mockResolvedValue('paint');
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
  });

  it('returns paginated categories with parent options when requested', async () => {
    readCategoriesPageMock.mockResolvedValue({
      items: [
        {
          id: '10',
          name: 'Paint',
          slug: 'paint',
          nameAr: 'طلاء',
          image: null,
          isActive: true,
          status: 'active',
          parentId: '2',
          parentName: 'Walls',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          createdBy: null,
          createdByName: null,
          updatedBy: null,
          updatedByName: null,
        },
      ],
      parentOptions: [{ id: '2', name: 'Walls' }],
      pagination: {
        page: 1,
        limit: 50,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    const response = await GET(
      new NextRequest('http://localhost/api/categories?includeParentOptions=1'),
    );

    expect(readCategoriesPageMock).toHaveBeenCalledWith({ page: 1, limit: 50, search: '' }, true);
    await expect(response.json()).resolves.toEqual({
      writable: true,
      items: [
        {
          id: '10',
          name: 'Paint',
          slug: 'paint',
          nameAr: 'طلاء',
          image: null,
          isActive: true,
          status: 'active',
          parentId: '2',
          parentName: 'Walls',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          createdBy: null,
          createdByName: null,
          updatedBy: null,
          updatedByName: null,
        },
      ],
      parentOptions: [{ id: '2', name: 'Walls' }],
      pagination: {
        page: 1,
        limit: 50,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it('returns 400 for malformed pagination queries', async () => {
    const response = await GET(new NextRequest('http://localhost/api/categories?page=0'));

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
    expect(readCategoriesPageMock).not.toHaveBeenCalled();
  });

  it('creates categories through the dedicated route', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Paint',
          nameAr: 'طلاء',
          imageUrl: 'https://cdn.example.com/paint.jpg',
          parentId: 2,
        }),
      }),
    );

    expect(resolveCategorySlugMock).toHaveBeenCalledWith('Paint');
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        entityType: 'categories',
        operation: 'create',
        actor: { email: 'admin@example.com', name: 'Admin' },
      }),
    );
    expect(response.status).toBe(200);
    expect(revalidateStorefrontProductMetaMock).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
