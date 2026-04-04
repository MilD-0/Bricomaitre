import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, PATCH } from '../route';

const { hasDbMock, getDbMock, requireMutationAccessMock, authMock, mutateEntityWithHistoryMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  mutateEntityWithHistoryMock: vi.fn(),
}));

vi.mock('../../../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../lib/action-history', () => ({
  mutateEntityWithHistory: mutateEntityWithHistoryMock,
}));

  vi.mock('../../../../../../lib/rbac', () => ({
    getEntityMutationResource: (entityType: string) => {
      if (entityType === 'products') return 'products';
      if (entityType === 'orders') return 'orders';
      if (entityType === 'assets') return 'assets';
      if (entityType === 'brands' || entityType === 'categories' || entityType === 'brandsCategories') return 'brandsCategories';
      return null;
    },
    requireMutationAccess: requireMutationAccessMock,
  }));

describe('app/api/entities/[entityType]/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    requireMutationAccessMock.mockResolvedValue(null);
    authMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mutateEntityWithHistoryMock.mockReset();
    mutateEntityWithHistoryMock.mockResolvedValue(undefined);
  });

  it('returns 400 for PATCH on read-only entity types', async () => {
    const res = await PATCH(
      new NextRequest('http://localhost/api/entities/inventory/1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'inventory', id: '1' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Read only entity type' });
  });

  it('returns 503 for PATCH when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await PATCH(
      new NextRequest('http://localhost/api/entities/orders/1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'orders', id: '1' }) },
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns 401 when RBAC denies PATCH access', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));

    const res = await PATCH(
      new NextRequest('http://localhost/api/entities/orders/1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'orders', id: '1' }) },
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when PATCH payload fails validation', async () => {
    hasDbMock.mockReturnValue(true);

    const res = await PATCH(
      new NextRequest('http://localhost/api/entities/orders/10', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'invalid' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'orders', id: '10' }) },
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: expect.objectContaining({
        fieldErrors: expect.objectContaining({ status: expect.any(Array) }),
      }),
    });
  });

  it('records history metadata on PATCH mutations', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    const res = await PATCH(
      new NextRequest('http://localhost/api/entities/orders/10', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ entityType: 'orders', id: '10' }) },
    );

    expect(requireMutationAccessMock).toHaveBeenCalledWith('orders');
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
      entityType: 'orders',
      entityId: 10,
      operation: 'update',
      actor: { email: 'admin@example.com', name: 'Admin' },
      execute: expect.any(Function),
    }));
    expect(res.status).toBe(200);
  });

  it('deletes products successfully and records history', async () => {
    hasDbMock.mockReturnValue(true);
    const db = { marker: 'db' };
    getDbMock.mockReturnValue(db);

    const res = await DELETE(new NextRequest('http://localhost/api/entities/products/7', { method: 'DELETE' }), {
      params: Promise.resolve({ entityType: 'products', id: '7' }),
    });

    expect(requireMutationAccessMock).toHaveBeenCalledWith('products');
    expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
      entityType: 'products',
      entityId: 7,
      operation: 'delete',
      actor: { email: 'admin@example.com', name: 'Admin' },
      execute: expect.any(Function),
    }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

   it('returns 400 for read-only entity type on DELETE', async () => {
     hasDbMock.mockReturnValue(true);

     const res = await DELETE(new NextRequest('http://localhost/api/entities/inventory/5', { method: 'DELETE' }), {
       params: Promise.resolve({ entityType: 'inventory', id: '5' }),
     });

     expect(res.status).toBe(400);
     await expect(res.json()).resolves.toEqual({ error: 'Read only entity type' });
   });

   it('updates brand active status via PATCH', async () => {
     hasDbMock.mockReturnValue(true);
     const db = { marker: 'db' };
     getDbMock.mockReturnValue(db);

     const res = await PATCH(
       new NextRequest('http://localhost/api/entities/brands/5', {
         method: 'PATCH',
         body: JSON.stringify({ status: 'active' }),
         headers: { 'content-type': 'application/json' },
       }),
       { params: Promise.resolve({ entityType: 'brands', id: '5' }) },
     );

     expect(requireMutationAccessMock).toHaveBeenCalledWith('brandsCategories');
     expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
       entityType: 'brands',
       entityId: 5,
       operation: 'update',
       execute: expect.any(Function),
     }));
     expect(res.status).toBe(200);
   });

   it('updates brand metadata via PATCH', async () => {
     hasDbMock.mockReturnValue(true);
     const db = { marker: 'db' };
     getDbMock.mockReturnValue(db);

     const res = await PATCH(
       new NextRequest('http://localhost/api/entities/brands/5', {
         method: 'PATCH',
         body: JSON.stringify({ name: 'Acme Pro' }),
         headers: { 'content-type': 'application/json' },
       }),
       { params: Promise.resolve({ entityType: 'brands', id: '5' }) },
     );

     expect(requireMutationAccessMock).toHaveBeenCalledWith('brandsCategories');
     expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
       entityType: 'brands',
       entityId: 5,
       operation: 'update',
       execute: expect.any(Function),
     }));
     expect(res.status).toBe(200);
   });

   it('updates category active status via PATCH', async () => {
     hasDbMock.mockReturnValue(true);
     const db = { marker: 'db' };
     getDbMock.mockReturnValue(db);

     const res = await PATCH(
       new NextRequest('http://localhost/api/entities/categories/3', {
         method: 'PATCH',
         body: JSON.stringify({ status: 'draft' }),
         headers: { 'content-type': 'application/json' },
       }),
       { params: Promise.resolve({ entityType: 'categories', id: '3' }) },
     );

     expect(requireMutationAccessMock).toHaveBeenCalledWith('brandsCategories');
     expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
       entityType: 'categories',
       entityId: 3,
       operation: 'update',
       execute: expect.any(Function),
     }));
     expect(res.status).toBe(200);
   });

   it('updates category parent metadata via PATCH', async () => {
     hasDbMock.mockReturnValue(true);
     const db = { marker: 'db' };
     getDbMock.mockReturnValue(db);

     const res = await PATCH(
       new NextRequest('http://localhost/api/entities/categories/3', {
         method: 'PATCH',
         body: JSON.stringify({ name: 'Exterior paint', nameAr: 'طلاء خارجي', parentId: 7, imageUrl: 'https://example.com/cat.jpg' }),
         headers: { 'content-type': 'application/json' },
       }),
       { params: Promise.resolve({ entityType: 'categories', id: '3' }) },
     );

     expect(requireMutationAccessMock).toHaveBeenCalledWith('brandsCategories');
     expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
       entityType: 'categories',
       entityId: 3,
       operation: 'update',
       execute: expect.any(Function),
     }));
     expect(res.status).toBe(200);
   });

   it('deletes brand via DELETE', async () => {
     hasDbMock.mockReturnValue(true);
     const db = { marker: 'db' };
     getDbMock.mockReturnValue(db);

     const res = await DELETE(new NextRequest('http://localhost/api/entities/brands/7', { method: 'DELETE' }), {
       params: Promise.resolve({ entityType: 'brands', id: '7' }),
     });

     expect(requireMutationAccessMock).toHaveBeenCalledWith('brandsCategories');
     expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
       entityType: 'brands',
       entityId: 7,
       operation: 'delete',
       execute: expect.any(Function),
     }));
     expect(res.status).toBe(200);
     await expect(res.json()).resolves.toEqual({ ok: true });
   });

   it('deletes category via DELETE', async () => {
     hasDbMock.mockReturnValue(true);
     const db = { marker: 'db' };
     getDbMock.mockReturnValue(db);

     const res = await DELETE(new NextRequest('http://localhost/api/entities/categories/2', { method: 'DELETE' }), {
       params: Promise.resolve({ entityType: 'categories', id: '2' }),
     });

     expect(requireMutationAccessMock).toHaveBeenCalledWith('brandsCategories');
     expect(mutateEntityWithHistoryMock).toHaveBeenCalledWith(db, expect.objectContaining({
       entityType: 'categories',
       entityId: 2,
       operation: 'delete',
       execute: expect.any(Function),
     }));
     expect(res.status).toBe(200);
     await expect(res.json()).resolves.toEqual({ ok: true });
   });
 });
