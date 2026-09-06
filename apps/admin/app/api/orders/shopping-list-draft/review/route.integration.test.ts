import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminMutationIdempotencyConflictError } from '../../../../../lib/admin-mutation-idempotency';
import { ShoppingListDraftConflictError } from '../../../../../lib/shopping-list-drafts.server';
import { ShoppingListAllocationReviewError } from '../../../../../lib/shopping-list-stock-allocations';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  hasDb: vi.fn(),
  db: {},
  auth: vi.fn(),
  load: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb, getDb: () => mocks.db }));
vi.mock('../../../../../lib/rbac', () => ({ requireMutationAccess: mocks.access }));
vi.mock('../../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../lib/shopping-list-stock-allocations', async (original) => ({
  ...(await original<typeof import('../../../../../lib/shopping-list-stock-allocations')>()),
  loadShoppingListAllocationReview: mocks.load,
  reconcileShoppingListAllocationReview: mocks.reconcile,
}));

const url = 'http://localhost/api/orders/shopping-list-draft/review';
const payload = {
  scopeKey: 'selected:11,12',
  revision: 3,
  productId: 7,
  requestId: 'review-request-1',
  orders: [
    { orderId: 11, quantity: 2 },
    { orderId: 12, quantity: 1 },
  ],
  manualQuantity: 1,
};
const getRequest = () => new NextRequest(`${url}?sourceMode=selected&orderIds=11&orderIds=12`);
const postRequest = (body: unknown = payload) =>
  new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(null);
  mocks.hasDb.mockReturnValue(true);
  mocks.auth.mockResolvedValue({ user: { email: 'operator@example.com', name: 'Demo Operator' } });
});

describe('shopping stock review route', () => {
  it.each(['GET', 'POST'] as const)(
    'requires orders mutation access before %s work',
    async (method) => {
      mocks.access.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      const response = method === 'GET' ? await GET(getRequest()) : await POST(postRequest());
      expect(response.status).toBe(403);
      expect(mocks.access).toHaveBeenCalledExactlyOnceWith('orders');
      expect(mocks.hasDb).not.toHaveBeenCalled();
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.reconcile).not.toHaveBeenCalled();
      expect(mocks.auth).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'POST'] as const)('reports unavailable database for %s', async (method) => {
    mocks.hasDb.mockReturnValue(false);
    const response = method === 'GET' ? await GET(getRequest()) : await POST(postRequest());
    expect(response.status).toBe(503);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('requires products mutation access before saving an attribution', async () => {
    mocks.access.mockImplementation(async (resource) =>
      resource === 'products' ? NextResponse.json({ error: 'Forbidden' }, { status: 403 }) : null,
    );
    expect((await POST(postRequest())).status).toBe(403);
    expect(mocks.access.mock.calls).toEqual([['orders'], ['products']]);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('parses the requested scope and repeated numeric order IDs before loading', async () => {
    const result = {
      reviews: [{ scopeKey: payload.scopeKey, revision: 3, title: 'Selected', products: [] }],
    };
    mocks.load.mockResolvedValue(result);
    const response = await GET(getRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith(mocks.db, {
      sourceMode: 'selected',
      orderIds: [11, 12],
    });
  });

  it.each(['sourceMode=unknown&orderIds=11', 'sourceMode=selected&orderIds=oops'])(
    'rejects invalid review query %s',
    async (search) => {
      expect((await GET(new NextRequest(`${url}?${search}`))).status).toBe(400);
      expect(mocks.load).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...payload, revision: undefined },
    { ...payload, manualQuantity: -1 },
    { ...payload, orders: [{ orderId: 11, quantity: 1.5 }] },
    { ...payload, quantity: 4 },
  ])('rejects invalid attribution input before actor lookup', async (body) => {
    expect((await POST(postRequest(body))).status).toBe(400);
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    expect((await POST(new NextRequest(url, { method: 'POST', body: '{broken' }))).status).toBe(
      400,
    );
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it.each([new ShoppingListDraftConflictError(), new AdminMutationIdempotencyConflictError()])(
    'returns conflict for %s',
    async (failure) => {
      mocks.reconcile.mockRejectedValue(failure);
      const response = await POST(postRequest());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: failure.message });
    },
  );

  it('returns attribution validation errors for correction', async () => {
    const failure = new ShoppingListAllocationReviewError(
      'Allocations must equal the recorded deduction.',
    );
    mocks.reconcile.mockRejectedValue(failure);
    const response = await POST(postRequest());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: failure.message });
  });

  it('passes validated explicit allocations and authenticated actor to reconciliation', async () => {
    const result = { ok: true, revision: 4 };
    mocks.reconcile.mockResolvedValue(result);
    const response = await POST(postRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(mocks.db, payload, {
      email: 'operator@example.com',
      name: 'Demo Operator',
    });
  });
});
