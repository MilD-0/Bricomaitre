import { NextRequest, NextResponse } from 'next/server';
import { type InferInsertModel, asc, eq } from 'drizzle-orm';
import {
  ensureOrderCompletedEventForOrder,
  ensureOrderConfirmedEventForOrder,
  isMetaCompletedStatus,
  isMetaOrderConfirmedStatus,
  normalizeAlgeriaPhone,
} from '@bric/storefront-core/meta';
import { ensureMarketingOrderStatusEvents } from '@bric/storefront-core/marketing';
import {
  readOrderProductSubtotal,
  resolveOrderCommercialState,
} from '@bric/storefront-core/order-commercial';
import { createPublicOrderToken } from '@bric/storefront-core/order-access';
import {
  CanonicalOrderNotFoundError,
  ensureCanonicalOrderPublicToken,
  updateCanonicalOrder,
} from '@bric/storefront-core/order-write';

import { getDb, hasDb } from '@bric/db/client';
import { loadOrderDetail } from '../../../../lib/admin-orders-data';
import { orderStatusHistory, orders } from '@bric/db/schema';
import { mutateEntityWithHistory } from '../../../../lib/action-history';
import { auth } from '../../../../lib/auth';
import { readEcotrackCatalog, resolveEcotrackDeliveryFee } from '../../../../lib/ecotrack';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import {
  DEGRADED_CAPTURE_VARIANT,
  canTransitionOrderStatus,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  orderPatchSchema,
} from '../../../../lib/orders';
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
  return (
    isBlank(input.phoneNumber1) ||
    input.cartProducts.length === 0 ||
    input.state == null ||
    isBlank(input.city) ||
    (input.delivery === 0 && isBlank(input.homeAddress))
  );
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
  const existing = await db.query.orders.findFirst({ where: eq(orders.id, numericId) });

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await auth();
  const actor = { email: session?.user?.email, name: session?.user?.name };
  const changes = parsed.data;
  const currentStatus = coerceOrderStatus(existing.confirmed);
  if (
    changes.confirmed !== undefined &&
    !canTransitionOrderStatus(currentStatus, changes.confirmed)
  ) {
    return NextResponse.json(
      {
        error: 'This status change requires an explicit correction.',
        from: currentStatus,
        to: changes.confirmed,
      },
      { status: 409 },
    );
  }
  const catalog =
    changes.delivery !== undefined || changes.state !== undefined || changes.city !== undefined
      ? await readEcotrackCatalog(db)
      : null;
  const nextDelivery = coerceDeliveryType(changes.delivery ?? existing.delivery);
  const nextState = changes.state !== undefined ? changes.state : existing.state;
  const nextDeliveryFee = catalog
    ? resolveEcotrackDeliveryFee(catalog, nextState, nextDelivery)
    : Number(existing.delPr ?? 0);
  const commercial =
    changes.cartProducts === undefined
      ? null
      : await resolveOrderCommercialState(db, {
          cartProducts: changes.cartProducts,
          promoCode: existing.promoCode,
        });
  const persistedSubtotal =
    commercial === null ? await readOrderProductSubtotal(db, existing) : commercial.productSubtotal;
  let shouldQueueConfirmation = false;
  let shouldQueueCompletion = false;

  const [updated] = await mutateEntityWithHistory(db, {
    entityType: 'orders',
    entityId: numericId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      const currentNoAnswerCount = coerceNoAnswerCount(
        currentStatus,
        existing.noAnswerCount,
        existing.confirmed,
      );
      const nextStatus = changes.confirmed ?? currentStatus;
      const nextNoAnswerCount =
        nextStatus === 1
          ? coerceNoAnswerCount(
              nextStatus,
              changes.noAnswerCount ?? currentNoAnswerCount,
              existing.confirmed,
            )
          : 0;
      const now = new Date();

      const update: Partial<InferInsertModel<typeof orders>> & { updatedAt: Date } = {
        updatedAt: now,
      };
      if (changes.firstName !== undefined) {
        update.firstName = changes.firstName;
      }
      if (changes.lastName !== undefined) {
        update.lastName = changes.lastName;
      }
      const nextPhoneNumber1 = changes.phoneNumber1 ?? existing.phoneNumber1;
      const nextCity = changes.city !== undefined ? changes.city : existing.city;
      const nextHomeAddress =
        changes.homeAddress !== undefined ? changes.homeAddress : existing.homeAddress;
      const nextCartProducts = commercial?.cartProducts ?? existing.cartProducts ?? [];

      if (changes.phoneNumber1 !== undefined) {
        update.phoneNumber1 = changes.phoneNumber1;
        update.normalizedPhone = normalizeAlgeriaPhone(changes.phoneNumber1);
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
      if (
        catalog &&
        (changes.delivery !== undefined ||
          changes.state !== undefined ||
          changes.city !== undefined)
      ) {
        update.delPr = nextDeliveryFee.toFixed(2);
        update.productSubtotal = persistedSubtotal.toFixed(2);
        update.totalAmount = (persistedSubtotal + nextDeliveryFee).toFixed(2);
      }

      update.variant = shouldUseDegradedCaptureVariant({
        phoneNumber1: nextPhoneNumber1,
        cartProducts: nextCartProducts,
        delivery: nextDelivery,
        state: nextState,
        city: nextCity,
        homeAddress: nextHomeAddress,
      })
        ? DEGRADED_CAPTURE_VARIANT
        : null;

      const result = await updateCanonicalOrder(tx, {
        orderId: numericId,
        values: update,
        commercial: commercial ?? undefined,
        deliveryFee: commercial ? nextDeliveryFee : undefined,
        status:
          changes.confirmed !== undefined || changes.noAnswerCount !== undefined
            ? { value: nextStatus, noAnswerCount: nextNoAnswerCount }
            : undefined,
        actor,
        now,
      });

      if (result.statusChanged) {
        shouldQueueConfirmation = isMetaOrderConfirmedStatus(nextStatus);
        shouldQueueCompletion = isMetaCompletedStatus(nextStatus);
      }

      return [result.order];
    },
  });

  const historyRows = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, numericId))
    .orderBy(asc(orderStatusHistory.changedAt));

  const firstCompletion = shouldQueueCompletion
    ? historyRows.find((entry) => isMetaCompletedStatus(coerceOrderStatus(entry.status)))
    : undefined;
  const firstConfirmation = shouldQueueConfirmation
    ? historyRows.find((entry) => isMetaOrderConfirmedStatus(coerceOrderStatus(entry.status)))
    : undefined;
  if (firstConfirmation) {
    try {
      await ensureOrderConfirmedEventForOrder(db, {
        orderId: numericId,
        statusHistoryId: firstConfirmation.id,
        status: coerceOrderStatus(firstConfirmation.status),
        changedAt: firstConfirmation.changedAt,
      });
    } catch (error) {
      console.error('Failed to queue Meta orderconfirmed event', {
        orderId: numericId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      await ensureMarketingOrderStatusEvents(db, {
        orderId: numericId,
        statusHistoryId: firstConfirmation.id,
        status: coerceOrderStatus(firstConfirmation.status),
        changedAt: firstConfirmation.changedAt,
      });
    } catch (error) {
      console.error('Failed to queue destination order-confirmed events', {
        orderId: numericId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (firstCompletion) {
    try {
      await ensureOrderCompletedEventForOrder(db, {
        orderId: numericId,
        statusHistoryId: firstCompletion.id,
        status: coerceOrderStatus(firstCompletion.status),
        changedAt: firstCompletion.changedAt,
      });
    } catch (error) {
      console.error('Failed to queue Meta OrderCompleted event', {
        orderId: numericId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      await ensureMarketingOrderStatusEvents(db, {
        orderId: numericId,
        statusHistoryId: firstCompletion.id,
        status: coerceOrderStatus(firstCompletion.status),
        changedAt: firstCompletion.changedAt,
      });
    } catch (error) {
      console.error('Failed to queue destination order-completed events', {
        orderId: numericId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const productLookup = await getOrderProductLookup(db, [updated]);

  return NextResponse.json({
    ok: true,
    item: toOrderRecord(
      updated,
      historyRows.map((entry) => ({
        id: entry.id,
        status: coerceOrderStatus(entry.status),
        noAnswerCount: coerceNoAnswerCount(
          coerceOrderStatus(entry.status),
          entry.noAnswerCount,
          entry.status,
        ),
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

  return NextResponse.json({ ok: true });
}
