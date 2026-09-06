import { NextRequest, NextResponse } from 'next/server';

import { hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { EcotrackMutationConflictError } from './ecotrack-mutations';
import { requireMutationAccess } from './rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from './sentry';

type RouteParams = { params: Promise<{ id: string }> };
type ActionActor = { email: string | null; name: string | null };

type EcotrackShipmentMutationOptions<TPayload, TItem> = RouteParams & {
  request: NextRequest;
  operation: string;
  route: string;
  fallbackError: string;
  parseBody?: (body: unknown) => TPayload;
  action: (orderId: number, payload: TPayload, actor: ActionActor) => Promise<TItem | null>;
};

export async function handleEcotrackShipmentMutation<TPayload = undefined, TItem = unknown>({
  request,
  params,
  operation,
  route,
  fallbackError,
  parseBody,
  action,
}: EcotrackShipmentMutationOptions<TPayload, TItem>) {
  const requestId = getRequestId(request);
  const { response: denied, session } = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const orderId = parsePositiveIntegerId((await params).id);
  if (!orderId) {
    return NextResponse.json(
      { error: 'Invalid order id' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  let payload: TPayload;
  if (parseBody) {
    try {
      payload = parseBody(await request.json().catch(() => null));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid request body.' },
        { status: 400, headers: withRequestIdHeaders(requestId) },
      );
    }
  } else {
    payload = undefined as TPayload;
  }

  try {
    const item = await action(orderId, payload, {
      email: session?.user?.email ?? null,
      name: session?.user?.name ?? null,
    });
    if (!item) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json({ ok: true, item }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, { requestId, operation, route, session });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : fallbackError },
      {
        status: error instanceof EcotrackMutationConflictError ? 409 : 502,
        headers: withRequestIdHeaders(requestId),
      },
    );
  }
}
