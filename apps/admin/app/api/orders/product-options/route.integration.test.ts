import { NextRequest } from 'next/server';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), getDb: vi.fn(), hasDb: vi.fn() }));
vi.mock('../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@bric/db/client', () => ({ getDb: mocks.getDb, hasDb: mocks.hasDb }));
import { requireMutationAccess } from '../../../../lib/rbac';
import { GET } from './route';

const request = (query = 'search=Drill&limit=8') =>
  new NextRequest(`http://localhost/api/orders/product-options?${query}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { isAllowed: true, permissions: ['orders_write'] } });
  mocks.hasDb.mockReturnValue(true);
});

it('allows Orders-only staff to find bounded product identity without catalog access or private fields', async () => {
  const item = { id: 4, title: 'Drill', price: '1200', images: [], brandId: 2 };
  const limit = vi.fn().mockResolvedValue([item]);
  const where = vi.fn((_condition: SQL | undefined) => ({ orderBy: () => ({ limit }) }));
  const select = vi.fn((_fields: Record<string, unknown>) => ({ from: () => ({ where }) }));
  mocks.getDb.mockReturnValue({ select });
  expect((await requireMutationAccess('products')).response?.status).toBe(403);
  const response = await GET(request('search=90%25_&limit=6'));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ items: [item] });
  expect(Object.keys(select.mock.calls[0]![0])).toEqual([
    'id',
    'title',
    'slug',
    'price',
    'images',
    'sku',
    'barcode',
    'mongoId',
    'brandId',
  ]);
  expect(limit).toHaveBeenCalledWith(6);
  const query = new PgDialect().sqlToQuery(where.mock.calls[0]![0]!);
  expect(query.sql).toContain('"archived_at" is null');
  expect(query.sql).toContain('"barcode" ilike');
  expect(query.sql).toContain('"title_ar" ilike');
  expect(query.params).toEqual(Array(4).fill('%90\\%\\_%'));
});

it.each([
  [null, 401],
  [{ user: { isAllowed: false, permissions: ['orders_write'] } }, 403],
  [{ user: { isAllowed: true, permissions: ['products_write'] } }, 403],
])(
  'rejects anonymous, revoked and catalog-only sessions before data access',
  async (session, status) => {
    mocks.auth.mockResolvedValue(session);
    expect((await GET(request())).status).toBe(status);
    expect(mocks.getDb).not.toHaveBeenCalled();
  },
);

it('rejects oversized and malformed lookups and avoids queries for empty searches', async () => {
  for (const query of [
    'search=x&limit=21',
    'search=x&limit=-1',
    'search=x&limit=nope',
    `search=${'x'.repeat(201)}`,
  ]) {
    expect((await GET(request(query))).status).toBe(400);
  }
  expect(await (await GET(request('search=%20'))).json()).toEqual({ items: [] });
  expect(mocks.getDb).not.toHaveBeenCalled();
});
