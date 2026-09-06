import { and, asc, eq, isNull } from 'drizzle-orm';
import { StorefrontOrderClaimLostError } from './order-idempotency';

import type { getDb } from '@bric/db/client';
import {
  orderMarketingAttribution,
  orderMetaAttribution,
  orderStatusHistory,
  orders,
  storefrontOrderIdempotency,
} from '@bric/db/schema';
import { readEcotrackDeliveryFee } from '../ecotrack-support';
import { assertReviewedOrderPrices, resolveOrderCommercialState } from '../order-commercial';
import {
  OrderProductLookup,
  getOrderProductLookup,
  toStorefrontOrderRecord,
} from '../order-records';
import { insertCanonicalOrder } from '../order-write';
import {
  DEGRADED_CAPTURE_VARIANT,
  coerceDeliveryType,
  coerceNoAnswerCount,
  coerceOrderStatus,
  type OrderStatusHistoryRecord,
} from '../orders-support';
import { attachJourneyToOrder } from './analytics';
import type { StorefrontOrderCreateRequest } from './contracts';
import { createOrderMarketingArtifacts } from './marketing';
import { createOrderMetaArtifacts, readMetaOrderLocation, type MetaRequestContext } from './meta';
import {
  createPublicOrderToken,
  createPublicOrderTokenExpiry,
  requireStorefrontOrderAccessByToken,
} from './order-access';

type Database = ReturnType<typeof getDb>;
type TimingStep = 'readEcotrackDeliveryFee' | 'insertOrder' | 'loadProductLookup' | 'buildOrderDto';

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
    reportEnrichmentError?: (error: unknown) => void;
    scheduleAfterCommit?: (work: () => Promise<void>) => void;
    metaRequestContext?: MetaRequestContext;
    idempotency?: {
      keyHash: string;
      fingerprint: string;
      createdAt: Date;
    };
  },
) {
  const now = new Date();
  const reportTiming = options?.reportTiming;
  function reportEnrichmentError(error: unknown) {
    try {
      options?.reportEnrichmentError?.(error);
    } catch {
      // Diagnostics must not undo a committed order or its optional savepoint.
    }
  }
  const publicToken = createPublicOrderToken();

  let degradedCapture = shouldStartAsDegradedCapture(payload);
  const commercial = await resolveOrderCommercialState(db, {
    cartProducts: payload.cartProducts,
    promoCode: payload.promoCode,
    productPromos: payload.productPromos,
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
    if (options?.idempotency) {
      const [claim] = await tx
        .select({ keyHash: storefrontOrderIdempotency.keyHash })
        .from(storefrontOrderIdempotency)
        .where(
          and(
            eq(storefrontOrderIdempotency.keyHash, options.idempotency.keyHash),
            eq(storefrontOrderIdempotency.fingerprint, options.idempotency.fingerprint),
            eq(storefrontOrderIdempotency.createdAt, options.idempotency.createdAt),
            isNull(storefrontOrderIdempotency.orderId),
          ),
        )
        .for('update');
      if (!claim) throw new StorefrontOrderClaimLostError();
    }
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
    if (payload.meta || payload.marketing) {
      try {
        await tx.transaction(async (enrichment) => {
          if (payload.meta) {
            metaResponse = await createOrderMetaArtifacts(enrichment, {
              order: createdOrder,
              lines: orderLines,
              eventId: payload.meta.leadEventId,
              eventSourceUrl: payload.meta.eventSourceUrl,
              requestContext: options?.metaRequestContext ?? {},
              location: metaLocation,
              now,
            });
          }
          if (payload.marketing) {
            await createOrderMarketingArtifacts(enrichment, {
              order: createdOrder,
              lines: orderLines,
              marketing: payload.marketing,
              requestContext: options?.metaRequestContext ?? {},
              now,
            });
          }
        });
      } catch (error) {
        metaResponse = undefined;
        reportEnrichmentError(error);
      }
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
            eq(storefrontOrderIdempotency.createdAt, options.idempotency.createdAt),
            isNull(storefrontOrderIdempotency.orderId),
          ),
        )
        .returning({ keyHash: storefrontOrderIdempotency.keyHash });
      if (completedRows.length !== 1) {
        throw new Error('Unable to complete the durable order idempotency record.');
      }
    }
    return createdOrder;
  });
  const currentOrder = created;
  if (payload.journeyId) {
    const attach = async () => {
      try {
        await attachJourneyToOrder(db, currentOrder.id, payload.journeyId ?? null);
      } catch (error) {
        reportEnrichmentError(error);
      }
    };
    if (options?.scheduleAfterCommit) options.scheduleAfterCommit(attach);
    else await attach();
  }

  let productLookup = new OrderProductLookup();
  try {
    productLookup = await measureStep('loadProductLookup', reportTiming, () =>
      getOrderProductLookup(db, [currentOrder]),
    );
  } catch (error) {
    reportEnrichmentError(error);
  }

  const item = await measureStep('buildOrderDto', reportTiming, async () =>
    toStorefrontOrderRecord(
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

  return hydrateStorefrontOrder(db, order);
}

async function hydrateStorefrontOrder(db: Database, order: typeof orders.$inferSelect) {
  const [historyRows, productLookup, purchaseEventId] = await Promise.all([
    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(asc(orderStatusHistory.changedAt)),
    getOrderProductLookup(db, [order]),
    readPurchaseEventId(db, order.id),
  ]);

  return toStorefrontOrderRecord(
    order,
    toStorefrontHistoryEntries(historyRows),
    productLookup,
    purchaseEventId,
  );
}

export async function readStorefrontOrderByToken(db: Database, token: string | null) {
  const access = await requireStorefrontOrderAccessByToken(db, token);

  if (access.kind !== 'ok') {
    return access;
  }

  return {
    kind: 'ok' as const,
    item: await hydrateStorefrontOrder(db, access.order),
    token: access.token,
  };
}
