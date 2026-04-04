import { type InferInsertModel, asc, eq } from 'drizzle-orm';

import type { getDb } from '../../../db/src/client';
import { orderStatusHistory, orders } from '../../../db/src/schema';
import { attachJourneyToOrder } from './analytics';
import { readEcotrackDeliveryFee } from '../ecotrack-support';
import {
  DEGRADED_CAPTURE_VARIANT,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  type OrderStatusHistoryRecord,
} from '../orders-support';
import { getOrderProductLookup, type ProductLookupEntry } from '../order-records';
import type { StorefrontOrderCreateRequest, StorefrontOrderPatchRequest } from './contracts';
import { toStorefrontOrderDto } from './dto';
import { createPublicOrderToken, requireStorefrontOrderAccess } from './order-access';

type Database = ReturnType<typeof getDb>;
type TimingStep =
  | 'readEcotrackDeliveryFee'
  | 'insertOrder'
  | 'attachJourneyToOrder'
  | 'insertStatusHistory'
  | 'loadProductLookup'
  | 'buildOrderDto';

type TimingEntry = {
  step: TimingStep;
  durationMs: number;
};

type TimingReporter = (entry: TimingEntry) => void;

function isBlank(value: string | null | undefined) {
  return value == null || value.trim().length === 0;
}

function shouldStartAsDegradedCapture(payload: StorefrontOrderCreateRequest) {
  return payload.cartProducts.length === 0
    || payload.state == null
    || isBlank(payload.city)
    || (payload.delivery === 0 && isBlank(payload.homeAddress));
}

async function measureStep<T>(
  step: TimingStep,
  reportTiming: TimingReporter | undefined,
  action: () => Promise<T>,
) {
  const startedAt = performance.now();

  try {
    return await action();
  } finally {
    reportTiming?.({
      step,
      durationMs: Number((performance.now() - startedAt).toFixed(1)),
    });
  }
}

function toStorefrontHistoryEntries(rows: typeof orderStatusHistory.$inferSelect[]): OrderStatusHistoryRecord[] {
  return rows.map((entry) => {
    const status = coerceOrderStatus(entry.status);

    return {
      id: entry.id,
      status,
      noAnswerCount: coerceNoAnswerCount(status, entry.noAnswerCount, entry.status),
      changedAt: entry.changedAt.toISOString(),
      changedBy: null,
      changedByName: null,
    };
  });
}

export async function createStorefrontOrder(
  db: Database,
  payload: StorefrontOrderCreateRequest,
  options?: {
    reportTiming?: TimingReporter;
  },
) {
  const now = new Date();
  const reportTiming = options?.reportTiming;
  const publicToken = createPublicOrderToken();
  let currentOrder: typeof orders.$inferSelect;
  let degradedCapture = shouldStartAsDegradedCapture(payload);

  const [createdOrder] = await measureStep('insertOrder', reportTiming, () => db.insert(orders).values({
    firstName: payload.firstName,
    lastName: payload.lastName,
    email: payload.email,
    phoneNumber1: payload.phoneNumber1,
    phoneNumber2: payload.phoneNumber2,
    publicToken,
    cartProducts: payload.cartProducts,
    journeyId: payload.journeyId,
    sessionId: payload.sessionId,
    delivery: coerceDeliveryType(payload.delivery),
    state: payload.state,
    city: payload.city,
    homeAddress: payload.homeAddress,
    note: payload.note,
    delPr: null,
    variant: degradedCapture ? DEGRADED_CAPTURE_VARIANT : null,
    createdAt: now,
    updatedAt: now,
  }).returning());
  currentOrder = createdOrder;
  const pendingTimings: Promise<unknown>[] = [];

  async function markDegradedCapture() {
    if (degradedCapture) {
      return;
    }

    degradedCapture = true;
    try {
      const [updatedOrder] = await db
        .update(orders)
        .set({
          variant: DEGRADED_CAPTURE_VARIANT,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, currentOrder.id))
        .returning();
      currentOrder = updatedOrder ?? { ...currentOrder, variant: DEGRADED_CAPTURE_VARIANT };
    } catch {
      currentOrder = { ...currentOrder, variant: DEGRADED_CAPTURE_VARIANT };
    }
  }

  if (payload.state != null) {
    pendingTimings.push((async () => {
      try {
        const deliveryFee = await measureStep('readEcotrackDeliveryFee', reportTiming, () =>
          readEcotrackDeliveryFee(db, payload.state, coerceDeliveryType(payload.delivery)));
        const deliveryFeeValue = deliveryFee.toFixed(2);
        await db
          .update(orders)
          .set({
            delPr: deliveryFeeValue,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, currentOrder.id));
        currentOrder = { ...currentOrder, delPr: deliveryFeeValue };
      } catch {
        await markDegradedCapture();
      }
    })());
  }

  if (payload.journeyId || payload.sessionId) {
    void measureStep('attachJourneyToOrder', reportTiming, () =>
      attachJourneyToOrder(db, currentOrder.id, payload.journeyId ?? null, payload.sessionId ?? null))
      .catch(() => {
        void markDegradedCapture();
      });
  }

  let historyRows: typeof orderStatusHistory.$inferSelect[] = [];
  let productLookup = new Map<string, ProductLookupEntry>();
  pendingTimings.push((async () => {
    try {
      const insertedHistory = await measureStep('insertStatusHistory', reportTiming, () => db
        .insert(orderStatusHistory)
        .values({
          orderId: currentOrder.id,
          status: currentOrder.confirmed,
          noAnswerCount: currentOrder.noAnswerCount,
          changedAt: now,
        })
        .returning());
      historyRows = insertedHistory;
    } catch {
      await markDegradedCapture();
    }
  })());

  pendingTimings.push((async () => {
    try {
      productLookup = await measureStep('loadProductLookup', reportTiming, () =>
        getOrderProductLookup(db, [currentOrder]));
    } catch {
      await markDegradedCapture();
    }
  })());

  await Promise.all(pendingTimings);

  return measureStep('buildOrderDto', reportTiming, async () =>
    toStorefrontOrderDto(currentOrder, toStorefrontHistoryEntries(historyRows), productLookup));
}

export async function readStorefrontOrder(
  db: Database,
  id: number,
  token: string | null,
) {
  const access = await requireStorefrontOrderAccess(db, id, token);

  if (access.kind !== 'ok') {
    return access;
  }

  const historyRows = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(asc(orderStatusHistory.changedAt));
  const productLookup = await getOrderProductLookup(db, [access.order]);

  return {
    kind: 'ok' as const,
    item: toStorefrontOrderDto(access.order, toStorefrontHistoryEntries(historyRows), productLookup),
    token: access.token,
  };
}

export async function updateStorefrontOrder(
  db: Database,
  id: number,
  token: string | null,
  changes: StorefrontOrderPatchRequest,
) {
  const access = await requireStorefrontOrderAccess(db, id, token);

  if (access.kind !== 'ok') {
    return access;
  }

  const shouldResolveDeliveryFee = changes.delivery !== undefined || changes.state !== undefined || changes.city !== undefined;
  const update: Partial<InferInsertModel<typeof orders>> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (changes.firstName !== undefined) update.firstName = changes.firstName;
  if (changes.lastName !== undefined) update.lastName = changes.lastName;
  if (changes.email !== undefined) update.email = changes.email;
  if (changes.phoneNumber1 !== undefined) update.phoneNumber1 = changes.phoneNumber1;
  if (changes.phoneNumber2 !== undefined) update.phoneNumber2 = changes.phoneNumber2;
  if (changes.note !== undefined) update.note = changes.note;
  if (changes.delivery !== undefined) update.delivery = changes.delivery;
  if (changes.state !== undefined) update.state = changes.state;
  if (changes.city !== undefined) update.city = changes.city;
  if (changes.homeAddress !== undefined) update.homeAddress = changes.homeAddress;
  if (changes.cartProducts !== undefined) update.cartProducts = changes.cartProducts;

  if (shouldResolveDeliveryFee) {
    const nextDelivery = coerceDeliveryType(changes.delivery ?? access.order.delivery);
    const nextState = changes.state !== undefined ? changes.state : access.order.state;
    update.delPr = (await readEcotrackDeliveryFee(db, nextState, nextDelivery)).toFixed(2);
  }

  const [updatedOrder] = await db
    .update(orders)
    .set(update)
    .where(eq(orders.id, id))
    .returning();
  const historyRows = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(asc(orderStatusHistory.changedAt));
  const productLookup = await getOrderProductLookup(db, [updatedOrder]);

  return {
    kind: 'ok' as const,
    item: toStorefrontOrderDto(updatedOrder, toStorefrontHistoryEntries(historyRows), productLookup),
    token: access.token,
  };
}
