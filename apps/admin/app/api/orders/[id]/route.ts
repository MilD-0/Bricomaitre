import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { createPublicOrderToken } from '@bric/storefront-core/order-access';
import {
  CanonicalOrderNotFoundError,
  ensureCanonicalOrderPublicToken,
} from '@bric/storefront-core/order-write';

import { getDb, hasDb } from '@bric/db/client';
import { loadOrderDetail } from '../../../../lib/admin-orders-data';
import { orders } from '@bric/db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { orderPatchSchema } from '../../../../lib/orders';
import {
  AdminOrderNotFoundError,
  AdminOrderStatusTransitionError,
  updateAdminOrder,
} from '../../../../lib/admin-order-update';
import { requireMutationAccess } from '../../../../lib/rbac';
import { triggerAdminReportingRefresh } from '../../../../lib/reporting-refresh-trigger';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('orders');
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
  const denied = await requireMutationAccess('orders');
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
    const publicToken = await db.transaction((tx) =>
      ensureCanonicalOrderPublicToken(tx, numericId, createPublicOrderToken()),
    );
    return NextResponse.json({ ok: true, publicToken });
  } catch (error) {
    if (error instanceof CanonicalOrderNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('orders');
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
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  try {
    return NextResponse.json({
      ok: true,
      item: await updateAdminOrder(db, numericId, parsed.data, actor),
    });
  } catch (error) {
    if (error instanceof AdminOrderNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (error instanceof AdminOrderStatusTransitionError) {
      return NextResponse.json(
        {
          error: 'This status change requires an explicit correction.',
          from: error.from,
          to: error.to,
        },
        { status: 409 },
      );
    }
    throw error;
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('orders');
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
  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };

  await mutateEntityWithHistory(db, {
    entityType: 'orders',
    entityId: numericId,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(orders).where(eq(orders.id, numericId)),
  });
  await triggerAdminReportingRefresh('order-delete');

  return NextResponse.json({ ok: true });
}
