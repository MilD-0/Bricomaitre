import { NextRequest, NextResponse } from 'next/server';
import { type InferInsertModel, asc, eq } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../db/client';
import { loadOrderDetail } from '../../../../lib/admin-orders-data';
import { orderStatusHistory, orders } from '../../../../db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { readEcotrackCatalog, resolveEcotrackDeliveryFee } from '../../../../lib/ecotrack';
import { DEGRADED_CAPTURE_VARIANT, coerceDeliveryType, coerceNoAnswerCount, coerceOrderStatus, isConfirmedLifecycleStatus, orderPatchSchema } from '../../../../lib/orders';
import { requireMutationAccess } from '../../../../lib/rbac';
import { getOrderProductLookup, toOrderRecord } from '../route-shared';

function isBlank(value: string | null | undefined) {
  return value == null || value.trim().length === 0;
}

function shouldUseDegradedCaptureVariant(input: {
  phoneNumber1: string;
  cartProducts: string[];
  delivery: 0 | 1;
  state: number | null;
  city: string | null;
  homeAddress: string | null;
}) {
  return isBlank(input.phoneNumber1)
    || input.cartProducts.length === 0
    || input.state == null
    || isBlank(input.city)
    || (input.delivery === 0 && isBlank(input.homeAddress));
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const { id } = await params;
  const item = await loadOrderDetail(Number(id));

  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('orders');
  if (denied) {
    return denied;
  }

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  }

  const parsed = orderPatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const numericId = Number(id);
  const db = getDb();
  const existing = await db.query.orders.findFirst({ where: eq(orders.id, numericId) });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const changes = parsed.data;
  const catalog = (changes.delivery !== undefined || changes.state !== undefined || changes.city !== undefined)
    ? await readEcotrackCatalog(db)
    : null;

  const [updated] = await mutateEntityWithHistory(db, {
    entityType: 'orders',
    entityId: numericId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      const currentStatus = coerceOrderStatus(existing.confirmed);
      const currentNoAnswerCount = coerceNoAnswerCount(currentStatus, existing.noAnswerCount, existing.confirmed);
      const nextStatus = changes.confirmed ?? currentStatus;
      const nextNoAnswerCount = nextStatus === 1
        ? coerceNoAnswerCount(nextStatus, changes.noAnswerCount ?? currentNoAnswerCount, existing.confirmed)
        : 0;
      const statusChanged = nextStatus !== currentStatus || nextNoAnswerCount !== currentNoAnswerCount;
      const now = new Date();

      const update: Partial<InferInsertModel<typeof orders>> & { updatedAt: Date } = {
        updatedAt: now,
      };
      const nextPhoneNumber1 = changes.phoneNumber1 ?? existing.phoneNumber1;
      const nextDelivery = coerceDeliveryType(changes.delivery ?? existing.delivery);
      const nextState = changes.state !== undefined ? changes.state : existing.state;
      const nextCity = changes.city !== undefined ? changes.city : existing.city;
      const nextHomeAddress = changes.homeAddress !== undefined ? changes.homeAddress : existing.homeAddress;
      const nextCartProducts = changes.cartProducts ?? (existing.cartProducts ?? []);

      if (changes.phoneNumber1 !== undefined) {
        update.phoneNumber1 = changes.phoneNumber1;
      }
      if (changes.note !== undefined) {
        update.note = changes.note;
      }
      if (changes.delivery !== undefined) {
        update.delivery = changes.delivery;
      }
      if (changes.state !== undefined) {
        update.state = changes.state;
      }
      if (changes.city !== undefined) {
        update.city = changes.city;
      }
      if (changes.homeAddress !== undefined) {
        update.homeAddress = changes.homeAddress;
      }
      if (changes.cartProducts !== undefined) {
        update.cartProducts = changes.cartProducts;
      }
      if (changes.confirmed !== undefined) {
        update.confirmed = nextStatus;
      }
      if (changes.confirmed !== undefined || changes.noAnswerCount !== undefined) {
        update.noAnswerCount = nextNoAnswerCount;

        if (isConfirmedLifecycleStatus(nextStatus)) {
          update.confirmedBy = existing.confirmedBy ?? actor.email ?? null;
          update.confirmedByName = existing.confirmedByName ?? actor.name ?? null;
          update.confirmedAt = existing.confirmedAt ?? now;
        } else {
          update.confirmedBy = null;
          update.confirmedByName = null;
          update.confirmedAt = null;
        }
      }

      if (catalog && (changes.delivery !== undefined || changes.state !== undefined || changes.city !== undefined)) {
        update.delPr = resolveEcotrackDeliveryFee(catalog, nextState, nextDelivery).toFixed(2);
      }

      update.variant = shouldUseDegradedCaptureVariant({
        phoneNumber1: nextPhoneNumber1,
        cartProducts: nextCartProducts,
        delivery: nextDelivery,
        state: nextState,
        city: nextCity,
        homeAddress: nextHomeAddress,
      }) ? DEGRADED_CAPTURE_VARIANT : null;

      const rows = await tx
        .update(orders)
        .set(update)
        .where(eq(orders.id, numericId))
        .returning();

      if (statusChanged) {
        await tx.insert(orderStatusHistory).values({
          orderId: numericId,
          status: nextStatus,
          noAnswerCount: nextNoAnswerCount,
          changedBy: actor.email ?? null,
          changedByName: actor.name ?? null,
          changedAt: now,
        });
      }

      return rows;
    },
  });

  const historyRows = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, numericId))
    .orderBy(asc(orderStatusHistory.changedAt));
  const productLookup = await getOrderProductLookup(db, [updated]);

  return NextResponse.json({
    ok: true,
    item: toOrderRecord(
      updated,
      historyRows.map((entry) => ({
        id: entry.id,
        status: coerceOrderStatus(entry.status),
        noAnswerCount: coerceNoAnswerCount(coerceOrderStatus(entry.status), entry.noAnswerCount, entry.status),
        changedAt: entry.changedAt.toISOString(),
        changedBy: entry.changedBy,
        changedByName: entry.changedByName,
      })),
      productLookup,
    ),
  });
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
  const numericId = Number(id);
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

  return NextResponse.json({ ok: true });
}
