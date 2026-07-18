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
import {
  createPublicOrderToken,
  requireStorefrontOrderAccess,
  requireStorefrontOrderAccessByToken,
} from './order-access';
import { resolveOrderPromo } from './promos';
import {
  createOrderMetaArtifacts,
  replaceOrderLineSnapshots,
  resolveOrderLineSnapshots,
  type MetaCommerceLine,
  type MetaRequestContext,
} from './meta';
import { createOrderMarketingArtifacts } from './marketing';

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

function buildCanonicalCartProducts(
  fallback: string[],
  lines: MetaCommerceLine[],
) {
  if (lines.length === 0) {
    return fallback;
  }

  return lines.flatMap((line) =>
    Array.from({ length: line.quantity }, () => line.contentId));
}

export async function createStorefrontOrder(
  db: Database,
  payload: StorefrontOrderCreateRequest,
  options?: {
    reportTiming?: TimingReporter;
    metaRequestContext?: MetaRequestContext;
  },
) {
  const now = new Date();
  const reportTiming = options?.reportTiming;
  const publicToken = createPublicOrderToken();
  let currentOrder: typeof orders.$inferSelect;
  let degradedCapture = shouldStartAsDegradedCapture(payload);
  const orderPromo = await resolveOrderPromo(db, {
    cartProducts: payload.cartProducts,
    promoCode: payload.promoCode,
    now,
  });
  const orderLines = await resolveOrderLineSnapshots(db, {
    cartProducts: payload.cartProducts,
    promoCode: orderPromo?.code ?? null,
    now,
  });
  const canonicalCartProducts = buildCanonicalCartProducts(payload.cartProducts, orderLines);
  let historyRows: typeof orderStatusHistory.$inferSelect[] = [];
  let metaResponse: Awaited<ReturnType<typeof createOrderMetaArtifacts>> | undefined;
  const created = await db.transaction(async (tx) => {
    const [createdOrder] = await measureStep('insertOrder', reportTiming, () => tx.insert(orders).values({
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phoneNumber1: payload.phoneNumber1,
      phoneNumber2: payload.phoneNumber2,
      publicToken,
      cartProducts: canonicalCartProducts,
      visitId: payload.visitId,
      journeyId: payload.journeyId,
      sessionId: payload.sessionId,
      delivery: coerceDeliveryType(payload.delivery),
      state: payload.state,
      city: payload.city,
      homeAddress: payload.homeAddress,
      note: payload.note,
      delPr: null,
      price: orderPromo ? orderPromo.finalSubtotal.toFixed(2) : null,
      promoCode: orderPromo?.code ?? null,
      promoProductId: orderPromo?.productId ?? null,
      promoOriginalSubtotal: orderPromo ? orderPromo.originalSubtotal.toFixed(2) : null,
      promoDiscountAmount: orderPromo ? orderPromo.discountAmount.toFixed(2) : null,
      promoFinalSubtotal: orderPromo ? orderPromo.finalSubtotal.toFixed(2) : null,
      variant: degradedCapture ? DEGRADED_CAPTURE_VARIANT : null,
      createdAt: now,
      updatedAt: now,
    }).returning());
    const insertedHistory = await measureStep('insertStatusHistory', reportTiming, () => tx
      .insert(orderStatusHistory)
      .values({
        orderId: createdOrder.id,
        status: createdOrder.confirmed,
        noAnswerCount: createdOrder.noAnswerCount,
        changedAt: now,
      })
      .returning());
    historyRows = insertedHistory;
    if (payload.meta) {
      metaResponse = await createOrderMetaArtifacts(tx, {
        order: createdOrder,
        lines: orderLines,
        eventId: payload.meta.leadEventId,
        eventSourceUrl: payload.meta.eventSourceUrl,
        requestContext: options?.metaRequestContext ?? {},
        now,
      });
    } else {
      await replaceOrderLineSnapshots(tx, createdOrder.id, orderLines, now);
    }
    if (payload.marketing) {
      await createOrderMarketingArtifacts(tx, {
        order: createdOrder,
        lines: orderLines,
        marketing: payload.marketing,
        requestContext: options?.metaRequestContext ?? {},
        now,
      });
    }
    return createdOrder;
  });
  currentOrder = created;
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

  let productLookup = new Map<string, ProductLookupEntry>();

  pendingTimings.push((async () => {
    try {
      productLookup = await measureStep('loadProductLookup', reportTiming, () =>
        getOrderProductLookup(db, [currentOrder]));
    } catch {
      await markDegradedCapture();
    }
  })());

  await Promise.all(pendingTimings);

  const item = await measureStep('buildOrderDto', reportTiming, async () =>
    toStorefrontOrderDto(currentOrder, toStorefrontHistoryEntries(historyRows), productLookup));
  return { item, meta: metaResponse };
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

export async function readStorefrontOrderByToken(
  db: Database,
  token: string | null,
) {
  const access = await requireStorefrontOrderAccessByToken(db, token);

  if (access.kind !== 'ok') {
    return access;
  }

  const historyRows = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, access.order.id))
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
  let nextOrderLines: MetaCommerceLine[] | null = null;

  if (changes.cartProducts !== undefined || changes.promoCode !== undefined) {
    const nextCartProducts = changes.cartProducts ?? access.order.cartProducts ?? [];
    const nextPromoCode = changes.promoCode !== undefined ? changes.promoCode : access.order.promoCode;
    const orderPromo = await resolveOrderPromo(db, {
      cartProducts: nextCartProducts,
      promoCode: nextPromoCode,
    });
    nextOrderLines = await resolveOrderLineSnapshots(db, {
      cartProducts: nextCartProducts,
      promoCode: orderPromo?.code ?? null,
    });

    update.cartProducts = buildCanonicalCartProducts(nextCartProducts, nextOrderLines);
    update.price = orderPromo ? orderPromo.finalSubtotal.toFixed(2) : null;
    update.promoCode = orderPromo?.code ?? null;
    update.promoProductId = orderPromo?.productId ?? null;
    update.promoOriginalSubtotal = orderPromo ? orderPromo.originalSubtotal.toFixed(2) : null;
    update.promoDiscountAmount = orderPromo ? orderPromo.discountAmount.toFixed(2) : null;
    update.promoFinalSubtotal = orderPromo ? orderPromo.finalSubtotal.toFixed(2) : null;
  }

  if (shouldResolveDeliveryFee) {
    const nextDelivery = coerceDeliveryType(changes.delivery ?? access.order.delivery);
    const nextState = changes.state !== undefined ? changes.state : access.order.state;
    update.delPr = (await readEcotrackDeliveryFee(db, nextState, nextDelivery)).toFixed(2);
  }

  let updatedOrder!: typeof orders.$inferSelect;
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(orders)
      .set(update)
      .where(eq(orders.id, id))
      .returning();
    updatedOrder = row;
    if (changes.cartProducts !== undefined || changes.promoCode !== undefined) {
      await replaceOrderLineSnapshots(tx, id, nextOrderLines ?? []);
    }
  });
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
