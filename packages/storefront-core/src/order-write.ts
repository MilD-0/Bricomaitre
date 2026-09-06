import { eq, type InferInsertModel } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orderLineItems, orderStatusHistory, orders } from '@bric/db/schema';

import { buildOrderCommercialValues, type ResolvedOrderCommercialState } from './order-commercial';
import {
  assertOrderStatusTransition,
  coerceNoAnswerCount,
  coerceOrderStatus,
  isConfirmedLifecycleStatus,
  type OrderStatus,
} from './orders-support';
import { normalizeAlgeriaPhone, replaceOrderLineSnapshots } from './storefront/meta';
import { createPublicOrderTokenExpiry } from './storefront/order-access';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

type CanonicalOrderValues = Omit<
  InferInsertModel<typeof orders>,
  | 'cartProducts'
  | 'productSubtotal'
  | 'totalAmount'
  | 'promoCode'
  | 'productPromos'
  | 'promoProductId'
  | 'promoOriginalSubtotal'
  | 'promoDiscountAmount'
  | 'promoFinalSubtotal'
  | 'normalizedPhone'
> & { phoneNumber1: string };

type CanonicalOrderUpdateValues = Omit<
  Partial<InferInsertModel<typeof orders>>,
  | 'id'
  | 'cartProducts'
  | 'productSubtotal'
  | 'totalAmount'
  | 'promoCode'
  | 'productPromos'
  | 'promoProductId'
  | 'promoOriginalSubtotal'
  | 'promoDiscountAmount'
  | 'promoFinalSubtotal'
  | 'inHouseStatus'
  | 'noAnswerCount'
>;

export class CanonicalOrderNotFoundError extends Error {
  constructor(readonly orderId: number) {
    super(`Order ${orderId} was not found.`);
    this.name = 'CanonicalOrderNotFoundError';
  }
}

export async function insertCanonicalOrder(
  tx: Transaction,
  input: {
    values: CanonicalOrderValues;
    commercial: ResolvedOrderCommercialState;
    deliveryFee: number;
    now?: Date;
    actor?: { email?: string | null; name?: string | null };
  },
) {
  const now = input.now ?? new Date();
  const status = coerceOrderStatus(input.values.inHouseStatus);
  const noAnswerCount = coerceNoAnswerCount(
    status,
    input.values.noAnswerCount,
    input.values.inHouseStatus,
  );
  const [order] = await tx
    .insert(orders)
    .values({
      ...input.values,
      ...buildOrderCommercialValues(input.commercial, input.deliveryFee),
      normalizedPhone: normalizeAlgeriaPhone(input.values.phoneNumber1),
      deliveryFee: input.deliveryFee.toFixed(2),
      inHouseStatus: status,
      noAnswerCount,
      createdAt: input.values.createdAt ?? now,
      updatedAt: input.values.updatedAt ?? now,
    })
    .returning();

  const [history] = await tx
    .insert(orderStatusHistory)
    .values({
      orderId: order.id,
      status,
      noAnswerCount,
      changedBy: input.actor?.email ?? null,
      changedByName: input.actor?.name ?? null,
      changedAt: now,
    })
    .returning();

  await replaceOrderLineSnapshots(tx, order.id, input.commercial.lines, now);

  return { order, history };
}

export async function updateCanonicalOrder(
  tx: Transaction,
  input: {
    orderId: number;
    values?: CanonicalOrderUpdateValues;
    commercial?: ResolvedOrderCommercialState;
    deliveryFee?: number;
    totals?: {
      productSubtotal: number;
      deliveryFee: number;
      subtotalOverride?: number | null;
    };
    status?: {
      value: OrderStatus;
      noAnswerCount?: number | null;
    };
    allowStatusCorrection?: boolean;
    now?: Date;
    actor?: { email?: string | null; name?: string | null };
  },
) {
  const now = input.now ?? new Date();
  const [current] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .for('update');
  if (!current) throw new CanonicalOrderNotFoundError(input.orderId);

  const update: Partial<InferInsertModel<typeof orders>> = {};
  if (input.commercial) {
    if (input.deliveryFee === undefined) {
      throw new Error('A delivery fee is required when updating order commercial values.');
    }
    Object.assign(update, buildOrderCommercialValues(input.commercial, input.deliveryFee));
    update.price = null;
  }
  Object.assign(update, input.values);
  if (input.totals) {
    const effectiveSubtotal = input.totals.subtotalOverride ?? input.totals.productSubtotal;
    update.productSubtotal = input.totals.productSubtotal.toFixed(2);
    update.price =
      input.totals.subtotalOverride == null ? null : input.totals.subtotalOverride.toFixed(2);
    update.totalAmount = (effectiveSubtotal + input.totals.deliveryFee).toFixed(2);
  }
  update.updatedAt = now;

  const previousStatus = coerceOrderStatus(current.inHouseStatus);
  const nextStatus = input.status?.value ?? previousStatus;
  if (!input.allowStatusCorrection) {
    assertOrderStatusTransition(previousStatus, nextStatus);
  }
  const previousNoAnswerCount = coerceNoAnswerCount(
    previousStatus,
    current.noAnswerCount,
    current.inHouseStatus,
  );
  const nextNoAnswerCount = input.status
    ? nextStatus === 1
      ? coerceNoAnswerCount(nextStatus, input.status.noAnswerCount, current.inHouseStatus)
      : 0
    : previousNoAnswerCount;
  const statusChanged =
    nextStatus !== previousStatus || nextNoAnswerCount !== previousNoAnswerCount;

  if (input.status) {
    update.inHouseStatus = nextStatus;
    update.noAnswerCount = nextNoAnswerCount;
    if (isConfirmedLifecycleStatus(nextStatus) && !current.confirmedAt) {
      update.confirmedAt = now;
      update.confirmedBy = input.actor?.email ?? null;
      update.confirmedByName = input.actor?.name ?? null;
    }
  }

  const [order] = await tx
    .update(orders)
    .set(update)
    .where(eq(orders.id, input.orderId))
    .returning();
  if (!order) throw new CanonicalOrderNotFoundError(input.orderId);

  if (input.commercial) {
    await replaceOrderLineSnapshots(tx, input.orderId, input.commercial.lines, now);
  }

  if (statusChanged) {
    await tx.insert(orderStatusHistory).values({
      orderId: input.orderId,
      status: nextStatus,
      noAnswerCount: nextNoAnswerCount,
      changedBy: input.actor?.email ?? null,
      changedByName: input.actor?.name ?? null,
      changedAt: now,
    });
  }

  return { previous: current, order, statusChanged };
}

/**
 * Restores an exact local snapshot after an upstream carrier mutation fails.
 * This is deliberately separate from normal edits: it may restore lifecycle
 * fields verbatim, but is only used as a compensating write for an operation
 * whose local half must be rolled back.
 */
export async function restoreCanonicalOrderSnapshot(
  tx: Transaction,
  input: {
    orderId: number;
    values: Omit<Partial<InferInsertModel<typeof orders>>, 'id'>;
    lineItems?: Array<InferInsertModel<typeof orderLineItems>>;
  },
) {
  const [current] = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.id, input.orderId))
    .for('update');
  if (!current) throw new CanonicalOrderNotFoundError(input.orderId);

  const [order] = await tx
    .update(orders)
    .set(input.values)
    .where(eq(orders.id, input.orderId))
    .returning();
  if (!order) throw new CanonicalOrderNotFoundError(input.orderId);

  if (input.lineItems) {
    await tx.delete(orderLineItems).where(eq(orderLineItems.orderId, input.orderId));
    if (input.lineItems.length > 0) await tx.insert(orderLineItems).values(input.lineItems);
  }
  return order;
}

export async function ensureCanonicalOrderPublicToken(
  tx: Transaction,
  orderId: number,
  publicToken: string,
) {
  const now = new Date();
  const [current] = await tx
    .select({
      publicToken: orders.publicToken,
      publicTokenExpiresAt: orders.publicTokenExpiresAt,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for('update');
  if (!current) throw new CanonicalOrderNotFoundError(orderId);
  if (
    current.publicToken &&
    current.publicTokenExpiresAt &&
    current.publicTokenExpiresAt.getTime() > now.getTime()
  ) {
    return current.publicToken;
  }

  const [updated] = await tx
    .update(orders)
    .set({
      publicToken,
      publicTokenExpiresAt: createPublicOrderTokenExpiry(now),
      updatedAt: now,
    })
    .where(eq(orders.id, orderId))
    .returning({ publicToken: orders.publicToken });
  if (!updated?.publicToken) throw new CanonicalOrderNotFoundError(orderId);
  return updated.publicToken;
}
