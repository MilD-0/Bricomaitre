import { CanonicalOrderNotFoundError } from '@bric/storefront-core/order-write';
import { NextRequest, NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import {
  AdminOrderHasActiveEcotrackShipmentError,
  AdminOrderLifecycleNotFoundError,
  deleteAdminOrder,
} from '@/lib/admin-order-lifecycle';
import { ensureAdminOrderPublicToken } from '@/lib/admin-order-tracking';
import { AdminOrderNotFoundError, updateAdminOrder } from '@/lib/admin-order-update';
import { loadOrderDetail } from '@/lib/admin-orders-data';
import { EcotrackMutationConflictError } from '@/lib/ecotrack-mutations';
import { orderPatchSchema } from '@/lib/orders';
import { requireMutationAccess } from '@/lib/rbac';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied } = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }
  const item = await loadOrderDetail(numericId);

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item });
}

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied } = await requireMutationAccess('orders');
  if (denied) return denied;
  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const numericId = parsePositiveIntegerId((await params).id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }

  const db = getDb();
  try {
    const publicToken = await ensureAdminOrderPublicToken(db, numericId);
    return NextResponse.json({ ok: true, publicToken });
  } catch (error) {
    if (error instanceof EcotrackMutationConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof CanonicalOrderNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = orderPatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }
  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    return NextResponse.json({
      ok: true,
      item: await updateAdminOrder(db, numericId, parsed.data, actor, {
        allowStatusCorrection: parsed.data.inHouseStatus !== undefined,
      }),
    });
  } catch (error) {
    if (error instanceof EcotrackMutationConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof AdminOrderNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const numericId = parsePositiveIntegerId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid order id' }, { status: 400 });
  }
  const db = getDb();

  const actor = { email: session?.user?.email, name: session?.user?.name };

  try {
    await deleteAdminOrder(db, numericId, actor);
  } catch (error) {
    if (error instanceof EcotrackMutationConflictError)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof AdminOrderLifecycleNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error instanceof AdminOrderHasActiveEcotrackShipmentError) {
      return NextResponse.json(
        {
          error: 'Delete the active EcoTrack shipment before permanently deleting this order.',
          trackingNumber: error.trackingNumber,
        },
        { status: 409 },
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
