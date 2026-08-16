import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PUT } from './route';

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

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
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
    requireMutationAccessMock.mockResolvedValue(null);
  });

  it('returns RBAC denial when access is forbidden', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

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
    getDbMock.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([draftRow()]),
          }),
        }),
      }),
    });

    const response = await GET(
      new NextRequest('http://localhost/api/orders/shopping-list-draft?sourceMode=confirmed'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      draft: {
        scopeKey: 'status:confirmed',
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
    const onConflictDoUpdateMock = vi.fn();
    const returningMock = vi.fn().mockResolvedValue([
      draftRow({
        scopeKey: 'selected:31,32',
        sourceMode: 'selected',
        orderIds: [31, 32],
        title: 'Selected shopping list',
      }),
    ]);
    valuesMock.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
    onConflictDoUpdateMock.mockReturnValue({ returning: returningMock });
    getDbMock.mockReturnValue({
      insert: () => ({ values: valuesMock }),
    });

    const response = await PUT(
      new NextRequest('http://localhost/api/orders/shopping-list-draft', {
        method: 'PUT',
        body: JSON.stringify({
          sourceMode: 'selected',
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
    expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          orderIds: [31, 32],
          updatedBy: 'admin@example.com',
        }),
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        draft: expect.objectContaining({ scopeKey: 'selected:31,32', orderIds: [31, 32] }),
      }),
    );
  });

  it('deletes a draft by scope', async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    getDbMock.mockReturnValue({
      delete: () => ({ where: whereMock }),
    });

    const response = await DELETE(
      new NextRequest(
        'http://localhost/api/orders/shopping-list-draft?sourceMode=selected&orderIds=32&orderIds=31',
      ),
    );

    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
