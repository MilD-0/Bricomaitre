import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';
import { ShoppingListDraftConflictError } from '@/lib/shopping-list-drafts.server';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  apply: vi.fn(),
  permissions: ['orders_write', 'products_write'] as string[],
}));
vi.mock('@/lib/rbac', async (original) => ({
  ...(await original<typeof import('@/lib/rbac')>()),
  requireMutationAccess: mocks.access,
}));
vi.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { email: 'operator@example.com', permissions: mocks.permissions } }),
}));
vi.mock('@bric/db/client', () => ({ hasDb: () => true, getDb: () => ({}) }));
vi.mock('@/lib/shopping-list-inventory.server', async (original) => ({
  ...(await original<typeof import('@/lib/shopping-list-inventory.server')>()),
  applyShoppingListInventory: mocks.apply,
}));
const payload = {
  sourceMode: 'selected',
  orderIds: [1],
  revision: 2,
  draftIds: ['1:2'],
  requestId: 'audit',
};
function request(body: unknown = payload) {
  return new NextRequest('http://localhost/api/orders/shopping-list-draft/apply', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.permissions = ['orders_write', 'products_write'];
  mocks.access.mockImplementation(async () => ({
    response: null,
    session: await (await import('@/lib/auth')).auth(),
  }));
});
it.each(['orders', 'products'])('requires %s mutation permission', async (resource) => {
  mocks.permissions = mocks.permissions.filter((permission) => permission !== `${resource}_write`);
  if (resource === 'orders')
    mocks.access.mockResolvedValue({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.apply).not.toHaveBeenCalled();
});
it('returns a recoverable conflict for a stale draft', async () => {
  mocks.apply.mockRejectedValue(new ShoppingListDraftConflictError());
  expect((await POST(request())).status).toBe(409);
});
it('rejects client-specified quantities and requires a revision', async () => {
  expect((await POST(request({ ...payload, quantity: 20 }))).status).toBe(400);
  expect((await POST(request({ ...payload, revision: undefined }))).status).toBe(400);
  expect(mocks.apply).not.toHaveBeenCalled();
});
