import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, PATCH } from '../route';
import { EcotrackMutationConflictError } from '../../../../../../../lib/ecotrack-mutations';

const {
  hasDbMock,
  authMock,
  requireMutationAccessMock,
  loadEcotrackOrderDetailMock,
  updateMock,
  deleteMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  loadEcotrackOrderDetailMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../../../lib/admin-ecotrack-orders-data', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../../../../lib/admin-ecotrack-orders-data')
  >('../../../../../../../lib/admin-ecotrack-orders-data');
  return {
    ...actual,
    loadEcotrackOrderDetail: loadEcotrackOrderDetailMock,
    updatePostedEcotrackOrder: updateMock,
    deletePostedEcotrackOrder: deleteMock,
  };
});

describe('app/api/orders/ecotrack/shipments/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    loadEcotrackOrderDetailMock.mockReset();
    updateMock.mockReset();
    deleteMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: await authMock(),
    }));
    loadEcotrackOrderDetailMock.mockResolvedValue({ orderId: 11 });
  });

  it('returns RBAC denial', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const response = await GET(
      new NextRequest('http://localhost/api/orders/ecotrack/shipments/11'),
      {
        params: Promise.resolve({ id: '11' }),
      },
    );

    expect(response.status).toBe(403);
  });

  it('loads shipment detail with system freshness actor', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/orders/ecotrack/shipments/11'),
      {
        params: Promise.resolve({ id: '11' }),
      },
    );

    expect(response.status).toBe(200);
    expect(loadEcotrackOrderDetailMock).toHaveBeenCalledWith(11, {
      email: null,
      name: 'ECOTRACK sync',
    });
    await expect(response.json()).resolves.toEqual({ item: { orderId: 11 } });
  });
  const draft = {
    firstName: 'Ada',
    phoneNumber1: '0550123456',
    delivery: 0,
    state: 16,
    city: 'Alger',
    homeAddress: 'Test street',
  };
  const patchRequest = (body: unknown) =>
    new NextRequest('http://localhost/api/orders/ecotrack/shipments/11', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  const params = () => ({ params: Promise.resolve({ id: '11' }) });

  it('validates shipment edits and keeps the shared mutation response and actor', async () => {
    const invalid = await PATCH(patchRequest({ ...draft, homeAddress: '' }), params());
    expect(invalid.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
    updateMock.mockResolvedValue({ orderId: 11, homeAddress: draft.homeAddress });
    const accepted = await PATCH(patchRequest(draft), params());
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({
      ok: true,
      item: { orderId: 11, homeAddress: draft.homeAddress },
    });
    expect(updateMock).toHaveBeenCalledWith(11, expect.objectContaining(draft), {
      email: 'ops@example.com',
      name: 'Ops',
    });
  });

  it('returns conflicts for unresolved edits and deletions', async () => {
    updateMock.mockRejectedValue(new EcotrackMutationConflictError(11));
    deleteMock.mockRejectedValue(new EcotrackMutationConflictError(11));
    expect((await PATCH(patchRequest(draft), params())).status).toBe(409);
    expect(
      (
        await DELETE(
          new NextRequest('http://localhost/api/orders/ecotrack/shipments/11', {
            method: 'DELETE',
          }),
          params(),
        )
      ).status,
    ).toBe(409);
  });
});
