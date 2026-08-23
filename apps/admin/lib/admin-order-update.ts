import { asc, eq, type InferInsertModel } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orderStatusHistory, orders } from '@bric/db/schema';
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
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';

import { mutateEntityWithHistory, type ActionActor } from './action-history';
import { readEcotrackCatalog, resolveEcotrackDeliveryFee } from './ecotrack';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import {
  DEGRADED_CAPTURE_VARIANT,
  canTransitionOrderStatus,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  orderPatchSchema,
  type OrderPatchInput,
  type OrderStatus,
} from './orders';
import { triggerAdminReportingRefresh } from './reporting-refresh-trigger';

type Database = ReturnType<typeof getDb>;

export class AdminOrderNotFoundError extends Error {
  constructor(readonly orderId: number) {
    super(`Order ${orderId} was not found.`);
    this.name = 'AdminOrderNotFoundError';
  }
}

export class AdminOrderStatusTransitionError extends Error {
  constructor(
    readonly from: OrderStatus,
    readonly to: OrderStatus,
  ) {
    super(`Order status cannot transition from ${from} to ${to}.`);
    this.name = 'AdminOrderStatusTransitionError';
  }
}

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

async function queueOrderLifecycleEvents(
  db: Database,
  input: {
    orderId: number;
    historyRows: (typeof orderStatusHistory.$inferSelect)[];
    queueConfirmation: boolean;
    queueCompletion: boolean;
  },
) {
  const firstConfirmation = input.queueConfirmation
    ? input.historyRows.find((entry) => isMetaOrderConfirmedStatus(coerceOrderStatus(entry.status)))
    : undefined;
  const firstCompletion = input.queueCompletion
    ? input.historyRows.find((entry) => isMetaCompletedStatus(coerceOrderStatus(entry.status)))
    : undefined;

  if (firstConfirmation) {
    try {
      await ensureOrderConfirmedEventForOrder(db, {
        orderId: input.orderId,
        statusHistoryId: firstConfirmation.id,
        status: coerceOrderStatus(firstConfirmation.status),
        changedAt: firstConfirmation.changedAt,
      });
    } catch (error) {
      console.error('Failed to queue Meta orderconfirmed event', {
        orderId: input.orderId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      await ensureMarketingOrderStatusEvents(db, {
        orderId: input.orderId,
        statusHistoryId: firstConfirmation.id,
        status: coerceOrderStatus(firstConfirmation.status),
        changedAt: firstConfirmation.changedAt,
      });
    } catch (error) {
      console.error('Failed to queue destination order-confirmed events', {
        orderId: input.orderId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (firstCompletion) {
    try {
      await ensureOrderCompletedEventForOrder(db, {
        orderId: input.orderId,
        statusHistoryId: firstCompletion.id,
        status: coerceOrderStatus(firstCompletion.status),
        changedAt: firstCompletion.changedAt,
      });
    } catch (error) {
      console.error('Failed to queue Meta OrderCompleted event', {
        orderId: input.orderId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    try {
      await ensureMarketingOrderStatusEvents(db, {
        orderId: input.orderId,
        statusHistoryId: firstCompletion.id,
        status: coerceOrderStatus(firstCompletion.status),
        changedAt: firstCompletion.changedAt,
      });
    } catch (error) {
      console.error('Failed to queue destination order-completed events', {
        orderId: input.orderId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Canonical admin order update used by both HTTP and assistant entrypoints. */
export async function updateAdminOrder(
  db: Database,
  orderId: number,
  input: OrderPatchInput,
  actor?: ActionActor,
) {
  const changes = orderPatchSchema.parse(input);
  const existing = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!existing) throw new AdminOrderNotFoundError(orderId);

  const currentStatus = coerceOrderStatus(existing.confirmed);
  if (
    changes.confirmed !== undefined &&
    !canTransitionOrderStatus(currentStatus, changes.confirmed)
  ) {
    throw new AdminOrderStatusTransitionError(currentStatus, changes.confirmed);
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
  let queueConfirmation = false;
  let queueCompletion = false;

  const [updated] = await mutateEntityWithHistory(db, {
    entityType: 'orders',
    entityId: orderId,
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

      if (changes.firstName !== undefined) update.firstName = changes.firstName;
      if (changes.lastName !== undefined) update.lastName = changes.lastName;
      const nextPhoneNumber1 = changes.phoneNumber1 ?? existing.phoneNumber1;
      const nextCity = changes.city !== undefined ? changes.city : existing.city;
      const nextHomeAddress =
        changes.homeAddress !== undefined ? changes.homeAddress : existing.homeAddress;
      const nextCartProducts = commercial?.cartProducts ?? existing.cartProducts ?? [];

      if (changes.phoneNumber1 !== undefined) {
        update.phoneNumber1 = changes.phoneNumber1;
        update.normalizedPhone = normalizeAlgeriaPhone(changes.phoneNumber1);
      }
      if (changes.note !== undefined) update.note = changes.note;
      if (changes.delivery !== undefined) update.delivery = changes.delivery;
      if (changes.state !== undefined) update.state = changes.state;
      if (changes.city !== undefined) update.city = changes.city;
      if (changes.homeAddress !== undefined) update.homeAddress = changes.homeAddress;
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
        orderId,
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
        queueConfirmation = isMetaOrderConfirmedStatus(nextStatus);
        queueCompletion = isMetaCompletedStatus(nextStatus);
      }
      return [result.order];
    },
  });

  const historyRows = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(asc(orderStatusHistory.changedAt));
  await queueOrderLifecycleEvents(db, {
    orderId,
    historyRows,
    queueConfirmation,
    queueCompletion,
  });
  const productLookup = await getOrderProductLookup(db, [updated]);
  await triggerAdminReportingRefresh('order-update');

  return toOrderRecord(
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
  );
}
