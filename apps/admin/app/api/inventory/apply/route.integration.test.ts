import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import { inventoryApplyResponseSchema } from '../../../../lib/inventory';

const { hasDbMock, getDbMock, requireMutationAccessMock, authMock, applyAdminInventoryBatchMock } =
  vi.hoisted(() => ({
    hasDbMock: vi.fn(),
    getDbMock: vi.fn(),
    requireMutationAccessMock: vi.fn(),
    authMock: vi.fn(),
    applyAdminInventoryBatchMock: vi.fn(),
  }));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/admin-inventory-workflow', () => ({
  applyAdminInventoryBatch: applyAdminInventoryBatchMock,
}));

describe('app/api/inventory/apply/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    authMock.mockReset();
    applyAdminInventoryBatchMock.mockReset();

    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ marker: 'db' });
    authMock.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
  });

  it('returns RBAC denial when access is forbidden', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const res = await POST(
      new NextRequest('http://localhost/api/inventory/apply', {
        method: 'POST',
        body: JSON.stringify({ mode: 'increase', items: [{ productId: 1, quantity: 1 }] }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(res.status).toBe(403);
  });

  it('applies batch inventory updates and reports skipped rows', async () => {
    applyAdminInventoryBatchMock.mockResolvedValue({
      ok: true,
      complete: false,
      items: [{ productId: 1, previousQuantity: 2, nextQuantity: 4 }],
      skipped: [{ productId: 2, reason: 'missing' }],
    });

    const res = await POST(
      new NextRequest('http://localhost/api/inventory/apply', {
        method: 'POST',
        body: JSON.stringify({
          requestId: '71d3f110-0bb0-41d9-bdc4-6107707c2524',
          mode: 'increase',
          items: [
            { productId: 1, quantity: 2, source: { type: 'order-scan', orderIds: [99] } },
            { productId: 2, quantity: 1, source: { type: 'shopping-list', orderIds: [44] } },
          ],
        }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(applyAdminInventoryBatchMock).toHaveBeenCalledWith(
      { marker: 'db' },
      {
        requestId: '71d3f110-0bb0-41d9-bdc4-6107707c2524',
        mode: 'increase',
        items: [
          { productId: 1, quantity: 2, source: { type: 'order-scan', orderIds: [99] } },
          { productId: 2, quantity: 1, source: { type: 'shopping-list', orderIds: [44] } },
        ],
      },
      { email: 'admin@example.com', name: 'Admin' },
    );
    expect(res.status).toBe(200);
    expect(inventoryApplyResponseSchema.parse(await res.json())).toEqual({
      ok: true,
      complete: false,
      items: [{ productId: 1, previousQuantity: 2, nextQuantity: 4 }],
      skipped: [{ productId: 2, reason: 'Product not found.' }],
    });
  });
});
