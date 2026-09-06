import { type InferInsertModel, and, asc, eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  orderMarketingAttribution,
  orderMetaAttribution,
  orderStatusHistory,
  orders,
  storefrontOrderIdempotency,
} from '@bric/db/schema';
import {
  readOrderProductSubtotal,
  resolveOrderCommercialState,
  assertReviewedOrderPrices,
} from '../order-commercial';
import { insertCanonicalOrder, updateCanonicalOrder } from '../order-write';
import { attachJourneyToOrder } from './analytics';
import { readEcotrackDeliveryFee } from '../ecotrack-support';
import {
  DEGRADED_CAPTURE_VARIANT,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  type OrderStatusHistoryRecord,
} from '../orders-support';
import { getOrderProductLookup, OrderProductLookup } from '../order-records';
import type { StorefrontOrderCreateRequest, StorefrontOrderPatchRequest } from './contracts';
import { toStorefrontOrderDto } from './dto';
import {
  createPublicOrderToken,
  createPublicOrderTokenExpiry,
  requireStorefrontOrderAccess,
  requireStorefrontOrderAccessByToken,
} from './order-access';
import { createOrderMetaArtifacts, readMetaOrderLocation, type MetaRequestContext } from './meta';
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
  return (
    payload.cartProducts.length === 0 ||
    payload.state == null ||
    isBlank(payload.city) ||
    (payload.delivery === 0 && isBlank(payload.homeAddress))
  );
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

function toStorefrontHistoryEntries(
  rows: (typeof orderStatusHistory.$inferSelect)[],
): OrderStatusHistoryRecord[] {
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

function fallbackPurchaseEventId(orderId: number) {
  return `storefront-purchase-${orderId}`;
}

async function readPurchaseEventId(db: Database, orderId: number) {
  const [attribution] = await db
    .select({
      marketingEventId: orderMarketingAttribution.eventId,
      metaLeadEventId: orderMetaAttribution.leadEventId,
    })
    .from(orders)
    .leftJoin(orderMarketingAttribution, eq(orderMarketingAttribution.orderId, orders.id))
    .leftJoin(orderMetaAttribution, eq(orderMetaAttribution.orderId, orders.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  return (
    attribution?.marketingEventId ??
    attribution?.metaLeadEventId ??
    fallbackPurchaseEventId(orderId)
  );
}

export async function createStorefrontOrder(
  db: Database,
  payload: StorefrontOrderCreateRequest,
  options?: {
    reportTiming?: TimingReporter;
    metaRequestContext?: MetaRequestContext;
    idempotency?: {
      keyHash: string;
      fingerprint: string;
    };
  },
) {
  const now = new Date();
  const reportTiming = options?.reportTiming;
  const publicToken = createPublicOrderToken();
  let currentOrder: typeof orders.$inferSelect;
  let degradedCapture = shouldStartAsDegradedCapture(payload);
  const commercial = await resolveOrderCommercialState(db, {
    cartProducts: payload.cartProducts,
    promoCode: payload.promoCode,
    now,
    requireOrderable: true,
  });
  const orderLines = commercial.lines;
  assertReviewedOrderPrices(commercial, payload);
  let deliveryFee = 0;
  if (payload.state != null) {
    try {
      deliveryFee = await measureStep('readEcotrackDeliveryFee', reportTiming, () =>
        readEcotrackDeliveryFee(db, payload.state, coerceDeliveryType(payload.delivery)),
      );
    } catch {
      degradedCapture = true;
    }
  }
  const metaLocation = payload.meta
    ? await readMetaOrderLocation(db, payload.state, payload.city).catch(() => null)
    : null;
  let historyRows: (typeof orderStatusHistory.$inferSelect)[] = [];
  let metaResponse: Awaited<ReturnType<typeof createOrderMetaArtifacts>> | undefined;
  const created = await db.transaction(async (tx) => {
    const canonical = await measureStep('insertOrder', reportTiming, () =>
      insertCanonicalOrder(tx, {
        commercial,
        deliveryFee,
        now,
        values: {
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          phoneNumber1: payload.phoneNumber1,
          phoneNumber2: payload.phoneNumber2,
          publicToken,
          publicTokenExpiresAt: createPublicOrderTokenExpiry(now),
          visitId: payload.visitId,
          journeyId: payload.journeyId,
          sessionId: payload.sessionId,
          delivery: coerceDeliveryType(payload.delivery),
          state: payload.state,
          city: payload.city,
          homeAddress: payload.homeAddress,
          note: payload.note,
          price: null,
          variant: degradedCapture ? DEGRADED_CAPTURE_VARIANT : null,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    const createdOrder = canonical.order;
    historyRows = [canonical.history];
    if (payload.meta) {
      metaResponse = await createOrderMetaArtifacts(tx, {
        order: createdOrder,
        lines: orderLines,
        eventId: payload.meta.leadEventId,
        eventSourceUrl: payload.meta.eventSourceUrl,
        requestContext: options?.metaRequestContext ?? {},
        location: metaLocation,
        now,
        linesAlreadyPersisted: true,
      });
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
    if (options?.idempotency) {
      const completedAt = new Date();
      const completedRows = await tx
        .update(storefrontOrderIdempotency)
        .set({
          orderId: createdOrder.id,
          metaResponse: metaResponse ?? null,
          completedAt,
          updatedAt: completedAt,
          expiresAt: new Date(completedAt.getTime() + 24 * 60 * 60 * 1_000),
        })
        .where(
          and(
            eq(storefrontOrderIdempotency.keyHash, options.idempotency.keyHash),
            eq(storefrontOrderIdempotency.fingerprint, options.idempotency.fingerprint),
          ),
        )
        .returning({ keyHash: storefrontOrderIdempotency.keyHash });
      if (completedRows.length !== 1) {
        throw new Error('Unable to complete the durable order idempotency record.');
      }
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
      const result = await db.transaction((tx) =>
        updateCanonicalOrder(tx, {
          orderId: currentOrder.id,
          values: { variant: DEGRADED_CAPTURE_VARIANT },
        }),
      );
      currentOrder = result.order;
    } catch {
      currentOrder = { ...currentOrder, variant: DEGRADED_CAPTURE_VARIANT };
    }
  }

  if (payload.journeyId || payload.sessionId) {
    void measureStep('attachJourneyToOrder', reportTiming, () =>
      attachJourneyToOrder(db, currentOrder.id, payload.journeyId ?? null),
    ).catch(() => {
      void markDegradedCapture();
    });
  }

  let productLookup = new OrderProductLookup();

  pendingTimings.push(
    (async () => {
      try {
        productLookup = await measureStep('loadProductLookup', reportTiming, () =>
          getOrderProductLookup(db, [currentOrder]),
        );
      } catch {
        await markDegradedCapture();
      }
    })(),
  );

  await Promise.all(pendingTimings);

  const item = await measureStep('buildOrderDto', reportTiming, async () =>
    toStorefrontOrderDto(
      currentOrder,
      toStorefrontHistoryEntries(historyRows),
      productLookup,
      payload.marketing?.eventId ??
        payload.meta?.leadEventId ??
        fallbackPurchaseEventId(currentOrder.id),
    ),
  );
  return { item, meta: metaResponse };
}

export async function readCommittedStorefrontOrder(db: Database, id: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;

  const [historyRows, productLookup, purchaseEventId] = await Promise.all([
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(asc(orderStatusHistory.changedAt)),
    getOrderProductLookup(db, [order]),
    readPurchaseEventId(db, id),
  ]);

  return toStorefrontOrderDto(
    order,
    toStorefrontHistoryEntries(historyRows),
    productLookup,
    purchaseEventId,
  );
}

export async function readStorefrontOrder(db: Database, id: number, token: string | null) {
  const access = await requireStorefrontOrderAccess(db, id, token);

  if (access.kind !== 'ok') {
    return access;
  }

  const [historyRows, productLookup, purchaseEventId] = await Promise.all([
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(asc(orderStatusHistory.changedAt)),
    getOrderProductLookup(db, [access.order]),
    readPurchaseEventId(db, id),
  ]);

  return {
    kind: 'ok' as const,
    item: toStorefrontOrderDto(
      access.order,
      toStorefrontHistoryEntries(historyRows),
      productLookup,
      purchaseEventId,
    ),
    token: access.token,
  };
}

export async function readStorefrontOrderByToken(db: Database, token: string | null) {
  const access = await requireStorefrontOrderAccessByToken(db, token);

  if (access.kind !== 'ok') {
    return access;
  }

  const [historyRows, productLookup, purchaseEventId] = await Promise.all([
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, access.order.id))
      .orderBy(asc(orderStatusHistory.changedAt)),
    getOrderProductLookup(db, [access.order]),
    readPurchaseEventId(db, access.order.id),
  ]);

  return {
    kind: 'ok' as const,
    item: toStorefrontOrderDto(
      access.order,
      toStorefrontHistoryEntries(historyRows),
      productLookup,
      purchaseEventId,
    ),
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

  const shouldResolveDeliveryFee =
    changes.delivery !== undefined || changes.state !== undefined || changes.city !== undefined;
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
  let nextCommercial: Awaited<ReturnType<typeof resolveOrderCommercialState>> | null = null;

  if (changes.cartProducts !== undefined || changes.promoCode !== undefined) {
    const nextCartProducts = changes.cartProducts ?? access.order.cartProducts ?? [];
    const nextPromoCode =
      changes.promoCode !== undefined ? changes.promoCode : access.order.promoCode;
    nextCommercial = await resolveOrderCommercialState(db, {
      cartProducts: nextCartProducts,
      promoCode: nextPromoCode,
    });
  }

  let nextDeliveryFee = Number(access.order.deliveryFee ?? 0);
  if (shouldResolveDeliveryFee) {
    const nextDelivery = coerceDeliveryType(changes.delivery ?? access.order.delivery);
    const nextState = changes.state !== undefined ? changes.state : access.order.state;
    nextDeliveryFee = await readEcotrackDeliveryFee(db, nextState, nextDelivery);
    update.deliveryFee = nextDeliveryFee.toFixed(2);
  }

  if (!nextCommercial && shouldResolveDeliveryFee) {
    const productSubtotal = await readOrderProductSubtotal(db, access.order);
    update.productSubtotal = productSubtotal.toFixed(2);
    update.totalAmount = (productSubtotal + nextDeliveryFee).toFixed(2);
  }

  let updatedOrder!: typeof orders.$inferSelect;
  await db.transaction(async (tx) => {
    const result = await updateCanonicalOrder(tx, {
      orderId: id,
      values: update,
      commercial: nextCommercial ?? undefined,
      deliveryFee: nextCommercial ? nextDeliveryFee : undefined,
    });
    updatedOrder = result.order;
  });
  const [historyRows, productLookup, purchaseEventId] = await Promise.all([
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(asc(orderStatusHistory.changedAt)),
    getOrderProductLookup(db, [updatedOrder]),
    readPurchaseEventId(db, id),
  ]);

  return {
    kind: 'ok' as const,
    item: toStorefrontOrderDto(
      updatedOrder,
      toStorefrontHistoryEntries(historyRows),
      productLookup,
      purchaseEventId,
    ),
    token: access.token,
  };
}
