import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, POST, PUT } from './route';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildShoppingListScopeKey } from '@/lib/shopping-list-drafts';

const { hasDbMock, getDbMock, authMock, requireMutationAccessMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
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

vi.mock('@/lib/stock-allocations/legacy', () => ({
  initializeLegacyShoppingListAllocations: vi.fn(),
}));
vi.mock('@/lib/stock-allocations/credits', () => ({
  hydrateShoppingListStockCredits: vi.fn(async (_db, draft) => draft),
}));

const draftItem = {
  draftId: '9:1',
  productId: 1,
  brandId: 9,
  brandName: 'Acme',
  title: 'Chair',
  quantity: 2,
  thumbnailUrl: 'https://cdn.example.com/chair.jpg',
  inventoryQuantity: 5,
  inventoryDecreaseQuantity: 2,
  inventoryShortageQuantity: 0,
  inventoryAppliedQuantity: 0,
  inventoryActionEligible: true,
  notes: ['Blue fabric'],
  checked: true,
  isCustom: false,
  generatedAt: '2026-03-01T10:30:00.000Z',
};

const orderGroup = {
  orderId: 31,
  customerName: 'Ada Lovelace',
  note: 'Blue fabric',
  generatedAt: '2026-03-01T10:30:00.000Z',
  products: [
    {
      title: 'Chair',
      quantity: 2,
      brandId: 9,
      brandName: 'Acme',
      thumbnailUrl: 'https://cdn.example.com/chair.jpg',
    },
  ],
};

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    scopeKey: 'status:confirmed',
    revision: 0,
    sourceMode: 'confirmed',
    orderIds: [31],
    title: 'Confirmed shopping list',
    draftItems: [draftItem],
    generatedItems: [draftItem],
    ordersSnapshot: [orderGroup],
    createdBy: 'admin@example.com',
    createdByName: 'Admin',
    updatedBy: 'admin@example.com',
    updatedByName: 'Admin',
    createdAt: new Date('2026-03-01T10:00:00.000Z'),
    updatedAt: new Date('2026-03-01T11:00:00.000Z'),
    ...overrides,
  };
}

describe('app/api/orders/shopping-list-draft/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
  });

  it('returns RBAC denial when access is forbidden', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const response = await GET(
      new NextRequest('http://localhost/api/orders/shopping-list-draft?sourceMode=confirmed'),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns null draft when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/orders/shopping-list-draft?sourceMode=confirmed'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ draft: null });
  });

  it('returns a saved draft by scope', async () => {
    const db = {
      transaction: vi.fn(),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([draftRow()]),
          }),
        }),
      }),
    };
    db.transaction.mockImplementation(async (fn) => fn(db));
    getDbMock.mockReturnValue(db);

    const response = await GET(
      new NextRequest('http://localhost/api/orders/shopping-list-draft?sourceMode=confirmed'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      draft: {
        scopeKey: 'status:confirmed',
        revision: 0,
        sourceMode: 'confirmed',
        orderIds: [31],
        title: 'Confirmed shopping list',
        draftItems: [draftItem],
        generatedItems: [draftItem],
        orders: [orderGroup],
        updatedAt: '2026-03-01T11:00:00.000Z',
        updatedByName: 'Admin',
      },
    });
  });

  it('loads a large selection by its server-computed identity from a body', async () => {
    const ids = Array.from({ length: 1000 }, (_, index) => 250000 + index);
    const scopeKey = buildShoppingListScopeKey('selected', ids);
    const where = vi.fn((_condition: import('drizzle-orm').SQL) => {
      void _condition;
      return { limit: async () => [draftRow({ sourceMode: 'selected', scopeKey, orderIds: ids })] };
    });
    const db = { transaction: vi.fn(), select: () => ({ from: () => ({ where }) }) };
    db.transaction.mockImplementation(async (fn) => fn(db));
    getDbMock.mockReturnValue(db);
    const response = await POST(
      new NextRequest('http://localhost/api/orders/shopping-list-draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceMode: 'selected',
          orderIds: [...ids].reverse(),
          scopeKey: 'forged',
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0]![0]!).params).toEqual([scopeKey]);
    expect(await response.json()).toMatchObject({ draft: { scopeKey, orderIds: ids } });
  });

  it('rejects oversized or invalid lookup bodies and enforces lookup RBAC', async () => {
    for (const payload of [
      null,
      { sourceMode: 'unknown', orderIds: [1] },
      { sourceMode: 'selected', orderIds: Array.from({ length: 10001 }, (_, i) => i + 1) },
    ]) {
      const response = await POST(
        new NextRequest('http://localhost/api/orders/shopping-list-draft', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      );
      expect(response.status).toBe(400);
    }
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));
    expect(
      (
        await POST(
          new NextRequest('http://localhost/api/orders/shopping-list-draft', { method: 'POST' }),
        )
      ).status,
    ).toBe(403);
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('resets a large selection using the stored canonical cohort and revision', async () => {
    const ids = Array.from({ length: 1000 }, (_, index) => 250000 + index);
    const scopeKey = buildShoppingListScopeKey('selected', ids);
    const row = draftRow({ sourceMode: 'selected', scopeKey, orderIds: ids });
    const where = vi.fn((_condition: import('drizzle-orm').SQL) => {
      void _condition;
      return { for: async () => [row] };
    });
    const set = vi.fn(() => ({
      where: () => ({ returning: async () => [{ ...row, revision: 1 }] }),
    }));
    const tx = { select: () => ({ from: () => ({ where }) }), update: () => ({ set }) };
    getDbMock.mockReturnValue({ transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) });
    const response = await DELETE(
      new NextRequest('http://localhost/api/orders/shopping-list-draft', {
        method: 'DELETE',
        body: JSON.stringify({
          sourceMode: 'selected',
          orderIds: [...ids].reverse(),
          revision: 0,
          scopeKey: 'forged',
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(new PgDialect().sqlToQuery(where.mock.calls[0]![0]!).params).toEqual([scopeKey]);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 1,
        draftItems: [expect.objectContaining({ checked: false })],
      }),
    );
    expect(await response.json()).toMatchObject({
      draft: { scopeKey, orderIds: ids, revision: 1 },
    });
    const stale = await DELETE(
      new NextRequest('http://localhost/api/orders/shopping-list-draft', {
        method: 'DELETE',
        body: JSON.stringify({ sourceMode: 'selected', orderIds: ids, revision: 8 }),
      }),
    );
    expect(stale.status).toBe(409);
  });

  it('rejects reset bodies without a current numeric revision', async () => {
    for (const revision of [undefined, null, -1]) {
      const response = await DELETE(
        new NextRequest('http://localhost/api/orders/shopping-list-draft', {
          method: 'DELETE',
          body: JSON.stringify({ sourceMode: 'selected', orderIds: [31], revision }),
        }),
      );
      expect(response.status).toBe(400);
    }
    expect(getDbMock).not.toHaveBeenCalled();
  });

  it('validates PUT payloads', async () => {
    const response = await PUT(
      new NextRequest('http://localhost/api/orders/shopping-list-draft', {
        method: 'PUT',
        body: JSON.stringify({
          sourceMode: 'confirmed',
          orderIds: [],
          title: '',
          draftItems: [],
          generatedItems: [],
          orders: [],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(400);
  });

  it('upserts a draft and sorts selected order scope deterministically', async () => {
    const valuesMock = vi.fn();
    const onConflictDoNothingMock = vi.fn();
    const returningMock = vi.fn().mockResolvedValue([
      draftRow({
        scopeKey: 'selected:31,32',
        sourceMode: 'selected',
        orderIds: [31, 32],
        title: 'Selected shopping list',
      }),
    ]);
    valuesMock.mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
    onConflictDoNothingMock.mockReturnValue({ returning: returningMock });
    const db = {
      transaction: vi.fn(),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
      insert: () => ({ values: valuesMock }),
    };
    db.transaction.mockImplementation(async (fn) => fn(db));
    getDbMock.mockReturnValue(db);

    const response = await PUT(
      new NextRequest('http://localhost/api/orders/shopping-list-draft', {
        method: 'PUT',
        body: JSON.stringify({
          sourceMode: 'selected',
          revision: null,
          orderIds: [32, 31, 31],
          title: 'Selected shopping list',
          draftItems: [draftItem],
          generatedItems: [draftItem],
          orders: [orderGroup],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scopeKey: 'selected:31,32',
        sourceMode: 'selected',
        orderIds: [31, 32],
        updatedBy: 'admin@example.com',
        updatedByName: 'Admin',
      }),
    );
    expect(onConflictDoNothingMock).toHaveBeenCalledWith(expect.any(Object));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        draft: expect.objectContaining({ scopeKey: 'selected:31,32', orderIds: [31, 32] }),
      }),
    );
  });

  it.each([undefined, ''])(
    'resets a query-based DELETE with body %s without deleting allocation history',
    async (body) => {
      const setMock = vi.fn(() => ({
        where: () => ({ returning: async () => [draftRow({ revision: 1 })] }),
      }));
      const tx = {
        select: () => ({ from: () => ({ where: () => ({ for: async () => [draftRow()] }) }) }),
        update: () => ({ set: setMock }),
      };
      getDbMock.mockReturnValue({
        transaction: async (callback: (value: typeof tx) => unknown) => callback(tx),
      });
      const response = await DELETE(
        new NextRequest(
          'http://localhost/api/orders/shopping-list-draft?sourceMode=selected&orderIds=32&orderIds=31&revision=0',
          { method: 'DELETE', body },
        ),
      );
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, draft: { revision: 1 } });
    },
  );
  it('does not fall back to query parameters for malformed or null JSON', async () => {
    for (const body of ['{bad', 'null', '{}']) {
      const response = await DELETE(
        new NextRequest(
          'http://localhost/api/orders/shopping-list-draft?sourceMode=selected&orderIds=31&revision=0',
          { method: 'DELETE', body },
        ),
      );
      expect(response.status).toBe(400);
    }
    expect(getDbMock).not.toHaveBeenCalled();
  });
});
