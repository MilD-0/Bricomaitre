import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleEcotrackShipmentMutation } from './ecotrack-route-handler';

const { authMock, captureAdminExceptionMock, hasDbMock, requireMutationAccessMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    captureAdminExceptionMock: vi.fn(),
    hasDbMock: vi.fn(),
    requireMutationAccessMock: vi.fn(),
  }),
);

vi.mock('@bric/db/client', () => ({ hasDb: hasDbMock }));
vi.mock('./auth', () => ({ auth: authMock }));
vi.mock('./rbac', () => ({ requireMutationAccess: requireMutationAccessMock }));
vi.mock('./sentry', async () => {
  const actual = await vi.importActual<typeof import('./sentry')>('./sentry');
  return {
    ...actual,
    captureAdminException: captureAdminExceptionMock,
    getRequestId: () => 'request-1',
  };
});

function runMutation({
  id = '42',
  body,
  parseBody,
  action = vi.fn().mockResolvedValue({ orderId: 42 }),
}: {
  id?: string;
  body?: string;
  parseBody?: (value: unknown) => { enabled: boolean };
  action?: (
    orderId: number,
    payload: { enabled: boolean },
    actor: { email: string | null; name: string | null },
  ) => Promise<unknown>;
} = {}) {
  return handleEcotrackShipmentMutation({
    request: new NextRequest('http://localhost/api/orders/ecotrack/shipments/42/action', {
      method: 'POST',
      body,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    }),
    params: Promise.resolve({ id }),
    operation: 'ecotrack-test',
    route: '/api/orders/ecotrack/shipments/[id]/action',
    fallbackError: 'Unable to update shipment.',
    parseBody,
    action,
  });
}

describe('handleEcotrackShipmentMutation', () => {
  beforeEach(() => {
    authMock.mockReset();
    captureAdminExceptionMock.mockReset();
    hasDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    authMock.mockResolvedValue({ user: { email: 'ops@example.com', name: 'Ops' } });
    hasDbMock.mockReturnValue(true);
    requireMutationAccessMock.mockResolvedValue(null);
  });

  it('runs a validated action with the authenticated actor and request id', async () => {
    const action = vi.fn().mockResolvedValue({ orderId: 42 });
    const response = await runMutation({
      body: JSON.stringify({ enabled: true }),
      parseBody(value) {
        if (!value || typeof value !== 'object' || !('enabled' in value)) {
          throw new Error('Invalid action request.');
        }
        return { enabled: value.enabled === true };
      },
      action,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('x-request-id')).toBe('request-1');
    expect(action).toHaveBeenCalledWith(
      42,
      { enabled: true },
      {
        email: 'ops@example.com',
        name: 'Ops',
      },
    );
    await expect(response.json()).resolves.toEqual({ ok: true, item: { orderId: 42 } });
  });

  it('returns controlled boundary responses before calling the action', async () => {
    const action = vi.fn();
    requireMutationAccessMock.mockResolvedValueOnce(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    expect((await runMutation({ action })).status).toBe(403);

    requireMutationAccessMock.mockResolvedValue(null);
    hasDbMock.mockReturnValueOnce(false);
    expect((await runMutation({ action })).status).toBe(503);
    expect((await runMutation({ id: 'invalid', action })).status).toBe(400);
    expect(action).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed or invalid JSON', async () => {
    const parseBody = (value: unknown) => {
      if (!value || typeof value !== 'object') throw new Error('Invalid action request.');
      return { enabled: true };
    };

    const response = await runMutation({ body: '{', parseBody });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid action request.' });
  });

  it('maps missing items and upstream failures consistently', async () => {
    const missing = await runMutation({ action: vi.fn().mockResolvedValue(null) });
    expect(missing.status).toBe(404);

    const failure = new Error('Carrier unavailable');
    const failed = await runMutation({ action: vi.fn().mockRejectedValue(failure) });
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toEqual({ error: 'Carrier unavailable' });
    expect(captureAdminExceptionMock).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ requestId: 'request-1', operation: 'ecotrack-test' }),
    );
  });
});
