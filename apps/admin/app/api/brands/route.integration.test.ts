import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

const {
  hasDbMock,
  getDbMock,
  authMock,
  requireMutationAccessMock,
  readBrandsPageMock,
  resolveBrandSlugMock,
  mutateEntityWithHistoryMock,
  revalidateStorefrontProductMetaMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  readBrandsPageMock: vi.fn(),
  resolveBrandSlugMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
  revalidateStorefrontProductMetaMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('@/lib/brands-categories-api', () => ({
  readBrandsPage: readBrandsPageMock,
  resolveBrandSlug: resolveBrandSlugMock,
}));

vi.mock('@/lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));
vi.mock('@/lib/storefront-revalidate', () => ({
  revalidateStorefrontProductMeta: revalidateStorefrontProductMetaMock,
}));

describe('app/api/brands/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    readBrandsPageMock.mockReset();
    resolveBrandSlugMock.mockReset();
    mutateEntityWithHistoryMock.mockReset();
    revalidateStorefrontProductMetaMock.mockReset().mockResolvedValue(undefined);

    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    getDbMock.mockReturnValue({});
    resolveBrandSlugMock.mockResolvedValue('nova');
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
  });

  it('rejects unauthorized list access', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const response = await GET(new NextRequest('http://localhost/api/brands'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns paginated brands from the dedicated route', async () => {
    readBrandsPageMock.mockResolvedValue({
      items: [
        {
          id: '1',
          name: 'Acme',
          slug: 'acme',
          image: null,
          isActive: true,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          createdBy: null,
          createdByName: null,
          updatedBy: null,
          updatedByName: null,
        },
      ],
      pagination: {
        page: 2,
        limit: 50,
        totalItems: 60,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });

    const response = await GET(new NextRequest('http://localhost/api/brands?page=2&search=ac'));

    expect(readBrandsPageMock).toHaveBeenCalledWith({
      page: 2,
      limit: 50,
      search: 'ac',
      sort: 'updated',
    });
    await expect(response.json()).resolves.toEqual({
      writable: true,
      items: [
        {
          id: '1',
          name: 'Acme',
          slug: 'acme',
          image: null,
          isActive: true,
          status: 'active',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
          createdBy: null,
          createdByName: null,
          updatedBy: null,
          updatedByName: null,
        },
      ],
      pagination: {
        page: 2,
        limit: 50,
        totalItems: 60,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
    });
  });

  it('returns 400 for malformed pagination queries', async () => {
    const response = await GET(new NextRequest('http://localhost/api/brands?limit=51'));

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
    expect(readBrandsPageMock).not.toHaveBeenCalled();
  });

  it('creates brands through the dedicated route', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/brands', {
        method: 'POST',
        body: JSON.stringify({ name: 'Nova', imageUrl: 'https://cdn.example.com/nova.jpg' }),
      }),
    );

    expect(resolveBrandSlugMock).toHaveBeenCalledWith('Nova', undefined, {});
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        entityType: 'brands',
        operation: 'create',
        actor: { email: 'admin@example.com', name: 'Admin' },
      }),
    );
    expect(response.status).toBe(200);
    expect(revalidateStorefrontProductMetaMock).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('creates brands without requiring an image URL', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/brands', {
        method: 'POST',
        body: JSON.stringify({ name: 'Nova' }),
      }),
    );

    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        entityType: 'brands',
        operation: 'create',
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
