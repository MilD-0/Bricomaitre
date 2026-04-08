import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH } from './route';

const {
  hasDbMock,
  getDbMock,
  authMock,
  requireAppAccessMock,
  requireMutationAccessMock,
  readBrandMock,
  resolveBrandSlugMock,
  mutateEntityWithHistoryMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  authMock: vi.fn(),
  requireAppAccessMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  readBrandMock: vi.fn(),
  resolveBrandSlugMock: vi.fn(),
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
  readBrand: readBrandMock,
  resolveBrandSlug: resolveBrandSlugMock,
}));

vi.mock('../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

describe('app/api/brands/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    requireAppAccessMock.mockReset();
    requireMutationAccessMock.mockReset();
    readBrandMock.mockReset();
    resolveBrandSlugMock.mockReset();
    mutateEntityWithHistoryMock.mockReset();

    requireAppAccessMock.mockResolvedValue(null);
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    getDbMock.mockReturnValue({});
    readBrandMock.mockResolvedValue({
      id: '7',
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
    });
    resolveBrandSlugMock.mockResolvedValue('acme-plus');
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
  });

  it('returns 401 when app access is denied', async () => {
    requireAppAccessMock.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const response = await GET(new Request('http://localhost/api/brands/7'), { params: Promise.resolve({ id: '7' }) });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns a single brand by id', async () => {
    hasDbMock.mockReturnValue(true);

    const response = await GET(new Request('http://localhost/api/brands/7'), { params: Promise.resolve({ id: '7' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 7, name: 'Acme', slug: 'acme' });
  });

  it('updates a brand through the dedicated route', async () => {
    hasDbMock.mockReturnValue(true);

    const response = await PATCH(new NextRequest('http://localhost/api/brands/7', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Acme Plus', status: 'draft' }),
    }), { params: Promise.resolve({ id: '7' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('deletes a brand through the dedicated route', async () => {
    hasDbMock.mockReturnValue(true);

    const response = await DELETE(new NextRequest('http://localhost/api/brands/7', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '7' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
