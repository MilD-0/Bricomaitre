import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminOrderHasActiveEcotrackShipmentError } from '../../../../../lib/admin-order-lifecycle';
import { AdminOrderNotFoundError } from '../../../../../lib/admin-order-update';
import { EcotrackMutationConflictError } from '../../../../../lib/ecotrack-mutations';
import { DELETE, GET, PATCH, POST } from '../route';

const mocks = vi.hoisted(() => ({
  hasDb: vi.fn(),
  getDb: vi.fn(),
  access: vi.fn(),
  auth: vi.fn(),
  detail: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  token: vi.fn(),
}));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb, getDb: mocks.getDb }));
vi.mock('../../../../../lib/rbac', () => ({ requireMutationAccess: mocks.access }));
vi.mock('../../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../lib/admin-orders-data', () => ({ loadOrderDetail: mocks.detail }));
vi.mock('../../../../../lib/admin-order-tracking', () => ({
  ensureAdminOrderPublicToken: mocks.token,
}));
vi.mock('../../../../../lib/admin-order-update', async (original) => ({
  ...(await original<typeof import('../../../../../lib/admin-order-update')>()),
  updateAdminOrder: mocks.update,
}));
vi.mock('../../../../../lib/admin-order-lifecycle', async (original) => ({
  ...(await original<typeof import('../../../../../lib/admin-order-lifecycle')>()),
  deleteAdminOrder: mocks.remove,
}));
const actor = { email: 'operator@example.invalid', name: 'Operator' };
const db = { transaction: 'domain boundary' };
const context = (id = '7') => ({ params: Promise.resolve({ id }) });
function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/orders/7', {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hasDb.mockReturnValue(true);
  mocks.getDb.mockReturnValue(db);
  mocks.access.mockResolvedValue(null);
  mocks.auth.mockResolvedValue({ user: actor });
});

describe('order detail HTTP boundary', () => {
  it.each([GET, POST, PATCH, DELETE])(
    'checks authority before parsing or loading',
    async (handler) => {
      mocks.access.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
      expect((await handler(request('PATCH', { note: 'changed' }), context())).status).toBe(403);
      expect(mocks.access).toHaveBeenCalledWith('orders');
      expect(mocks.getDb).not.toHaveBeenCalled();
      expect(mocks.detail).not.toHaveBeenCalled();
    },
  );

  it.each([GET, POST, PATCH, DELETE])(
    'rejects malformed IDs before domain work',
    async (handler) => {
      expect((await handler(request('PATCH', { note: 'changed' }), context('7junk'))).status).toBe(
        400,
      );
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.remove).not.toHaveBeenCalled();
      expect(mocks.token).not.toHaveBeenCalled();
      expect(mocks.detail).not.toHaveBeenCalled();
    },
  );

  it('validates the real patch schema and passes the authenticated actor and deliberate correction policy', async () => {
    const invalid = await PATCH(request('PATCH', { phoneNumber1: '' }), context());
    expect(invalid.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.update.mockResolvedValue({ id: 7, inHouseStatus: 2 });
    const response = await PATCH(request('PATCH', { inHouseStatus: 2 }), context());
    expect(await response.json()).toEqual({ ok: true, item: { id: 7, inHouseStatus: 2 } });
    expect(mocks.update).toHaveBeenLastCalledWith(db, 7, { inHouseStatus: 2 }, actor, {
      allowStatusCorrection: true,
    });
    await PATCH(request('PATCH', { note: 'changed' }), context());
    expect(mocks.update).toHaveBeenLastCalledWith(db, 7, { note: 'changed' }, actor, {
      allowStatusCorrection: false,
    });
  });

  it('maps missing orders and unresolved carrier mutations without claiming an accepted edit', async () => {
    mocks.update.mockRejectedValue(new AdminOrderNotFoundError(7));
    expect((await PATCH(request('PATCH', { note: 'changed' }), context())).status).toBe(404);
    mocks.update.mockRejectedValue(
      new EcotrackMutationConflictError(7, 'Resolve carrier operation'),
    );
    const conflict = await PATCH(request('PATCH', { note: 'changed' }), context());
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: 'Resolve carrier operation' });
  });

  it('returns canonical detail and token results and maps absent detail', async () => {
    mocks.detail.mockResolvedValue(null);
    expect((await GET(request('GET'), context())).status).toBe(404);
    mocks.detail.mockResolvedValue({ id: 7, statusHistory: [{ id: 12, status: 2 }] });
    expect(await (await GET(request('GET'), context())).json()).toEqual({
      ok: true,
      item: { id: 7, statusHistory: [{ id: 12, status: 2 }] },
    });
    mocks.token.mockResolvedValue('opaque-public-token');
    expect(await (await POST(request('POST'), context())).json()).toEqual({
      ok: true,
      publicToken: 'opaque-public-token',
    });
    expect(mocks.token).toHaveBeenCalledWith(db, 7);
  });

  it('passes the deletion actor and returns the actionable active-shipment conflict', async () => {
    mocks.remove.mockRejectedValue(new AdminOrderHasActiveEcotrackShipmentError(7, 'TRACK-7'));
    const conflict = await DELETE(request('DELETE'), context());
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ trackingNumber: 'TRACK-7' });
    expect(mocks.remove).toHaveBeenCalledWith(db, 7, actor);
    mocks.remove.mockResolvedValue({ id: 7 });
    expect(await (await DELETE(request('DELETE'), context())).json()).toEqual({ ok: true });
  });
});
