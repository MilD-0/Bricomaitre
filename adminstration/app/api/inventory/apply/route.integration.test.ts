import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const {
  hasDbMock,
  getDbMock,
  requireMutationAccessMock,
  authMock,
  applyInventoryQuantityChangeMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  authMock: vi.fn(),
  applyInventoryQuantityChangeMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/inventory-actions', () => ({
  applyInventoryQuantityChange: applyInventoryQuantityChangeMock,
}));

describe('app/api/inventory/apply/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    authMock.mockReset();
    applyInventoryQuantityChangeMock.mockReset();

    requireMutationAccessMock.mockResolvedValue(null);
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ marker: 'db' });
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
  });

  it('returns RBAC denial when access is forbidden', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const res = await POST(new NextRequest('http://localhost/api/inventory/apply', {
      method: 'POST',
      body: JSON.stringify({ mode: 'increase', items: [{ productId: 1, quantity: 1 }] }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(res.status).toBe(403);
  });

  it('applies batch inventory updates and reports skipped rows', async () => {
    applyInventoryQuantityChangeMock
      .mockResolvedValueOnce({ kind: 'updated', previousQuantity: 2, nextQuantity: 4, item: {} })
      .mockResolvedValueOnce({ kind: 'missing' });

    const res = await POST(new NextRequest('http://localhost/api/inventory/apply', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'increase',
        items: [
          { productId: 1, quantity: 2, source: { type: 'order-scan', orderIds: [99] } },
          { productId: 2, quantity: 1, source: { type: 'shopping-list', orderIds: [44] } },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    }));

    expect(applyInventoryQuantityChangeMock).toHaveBeenNthCalledWith(1, { marker: 'db' }, {
      productId: 1,
      mode: 'increase',
      quantity: 2,
      actor: { email: 'admin@example.com', name: 'Admin' },
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      items: [{ productId: 1, previousQuantity: 2, nextQuantity: 4 }],
      skipped: [{ productId: 2, reason: 'Product not found.' }],
    });
  });
});
