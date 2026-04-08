import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH } from './route';

const {
  hasDbMock,
  getDbMock,
  authMock,
  requireAppAccessMock,
  requireMutationAccessMock,
  readCategoryMock,
  resolveCategorySlugMock,
  mutateEntityWithHistoryMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  authMock: vi.fn(),
  requireAppAccessMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  readCategoryMock: vi.fn(),
  resolveCategorySlugMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireAppAccess: requireAppAccessMock,
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../lib/brands-categories-api', () => ({
  readCategory: readCategoryMock,
  resolveCategorySlug: resolveCategorySlugMock,
}));

vi.mock('../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

describe('app/api/categories/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    requireAppAccessMock.mockReset();
    requireMutationAccessMock.mockReset();
    readCategoryMock.mockReset();
    resolveCategorySlugMock.mockReset();
    mutateEntityWithHistoryMock.mockReset();

    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({});
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    requireAppAccessMock.mockResolvedValue(null);
    requireMutationAccessMock.mockResolvedValue(null);
    readCategoryMock.mockResolvedValue({
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
    });
    resolveCategorySlugMock.mockResolvedValue('exterior-paint');
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
  });

  it('returns a single category by id', async () => {
    const response = await GET(new NextRequest('http://localhost/api/categories/10'), { params: Promise.resolve({ id: '10' }) });

    expect(readCategoryMock).toHaveBeenCalledWith(10);
    expect(response.status).toBe(200);
  });

  it('updates categories through the dedicated route', async () => {
    const response = await PATCH(new NextRequest('http://localhost/api/categories/10', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Exterior paint', parentId: 3, status: 'draft' }),
    }), { params: Promise.resolve({ id: '10' }) });

    expect(readCategoryMock).toHaveBeenCalledWith(10);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('deletes categories through the dedicated route', async () => {
    const response = await DELETE(new NextRequest('http://localhost/api/categories/10', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '10' }),
    });

    expect(readCategoryMock).toHaveBeenCalledWith(10);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
