import { and, desc, eq, gte } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { createPublicOrderToken } from '@bric/storefront-core/order-access';
import { resolveOrderCommercialState } from '@bric/storefront-core/order-commercial';
import { storefrontOrderCreateSchema } from '@bric/storefront-core/order-domain';
import { insertCanonicalOrder } from '@bric/storefront-core/order-write';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';

import { mutateEntityWithHistory, type ActionActor } from './action-history';
import { loadOrderDetail } from './admin-orders-data';
import { readEcotrackCatalog, resolveEcotrackDeliveryFee } from './ecotrack';
import { triggerAdminReportingRefresh } from './reporting-refresh-trigger';

type Database = ReturnType<typeof getDb>;

export class AdminOrderLifecycleNotFoundError extends Error {
  constructor(readonly orderId: number) {
    super(`Order ${orderId} was not found.`);
    this.name = 'AdminOrderLifecycleNotFoundError';
  }
}

export class AdminOrderHasActiveEcotrackShipmentError extends Error {
  constructor(
    readonly orderId: number,
    readonly trackingNumber: string,
  ) {
    super(`Order ${orderId} has an active EcoTrack shipment (${trackingNumber}).`);
    this.name = 'AdminOrderHasActiveEcotrackShipmentError';
  }
}

export async function createAdminOrder(
  db: Database,
  input: unknown,
  actor?: ActionActor,
  now = new Date(),
) {
  const data = storefrontOrderCreateSchema.parse(input);
  const normalizedPhone = normalizeAlgeriaPhone(data.phoneNumber1);
  const [commercial, catalog] = await Promise.all([
    resolveOrderCommercialState(db, {
      cartProducts: data.cartProducts,
      promoCode: data.promoCode,
      now,
    }),
    data.state == null ? Promise.resolve(null) : readEcotrackCatalog(db),
  ]);
  const deliveryFee = catalog ? resolveEcotrackDeliveryFee(catalog, data.state, data.delivery) : 0;
  const degraded =
    commercial.lines.length === 0 ||
    data.state == null ||
    !data.city ||
    (data.delivery === 0 && !data.homeAddress);
  const duplicateCandidates = normalizedPhone
    ? await db
        .select({ id: orders.id, createdAt: orders.createdAt })
        .from(orders)
        .where(
          and(
            eq(orders.normalizedPhone, normalizedPhone),
            gte(orders.createdAt, new Date(now.getTime() - 24 * 60 * 60 * 1_000)),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(5)
    : [];

  const created = await mutateEntityWithHistory(db, {
    entityType: 'orders',
    operation: 'create',
    actor,
    execute: (tx) =>
      insertCanonicalOrder(tx, {
        commercial,
        deliveryFee,
        now,
        actor,
        values: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phoneNumber1: data.phoneNumber1,
          phoneNumber2: data.phoneNumber2,
          publicToken: createPublicOrderToken(),
          visitId: data.visitId,
          journeyId: data.journeyId,
          sessionId: data.sessionId,
          delivery: data.delivery,
          state: data.state,
          city: data.city,
          homeAddress: data.homeAddress,
          note: data.note,
          price: null,
          variant: degraded ? 'degraded_capture' : null,
        },
      }),
    resolveEntityId: (result) => result.order.id,
  });
  const item = await loadOrderDetail(created.order.id);
  if (!item) throw new AdminOrderLifecycleNotFoundError(created.order.id);
  await triggerAdminReportingRefresh('order-create');
  return {
    item,
    duplicateCandidates: duplicateCandidates.map((candidate) => ({
      id: candidate.id,
      createdAt: candidate.createdAt.toISOString(),
    })),
  };
}

export async function deleteAdminOrder(db: Database, orderId: number, actor?: ActionActor) {
  const existing = await loadOrderDetail(orderId);
  if (!existing) throw new AdminOrderLifecycleNotFoundError(orderId);
  const activeShipment = await db.query.ecotrackOrderStates.findFirst({
    columns: { trackingNumber: true },
    where: (state, { and, eq, isNull }) => and(eq(state.orderId, orderId), isNull(state.deletedAt)),
  });
  if (activeShipment) {
    throw new AdminOrderHasActiveEcotrackShipmentError(orderId, activeShipment.trackingNumber);
  }
  await mutateEntityWithHistory(db, {
    entityType: 'orders',
    entityId: orderId,
    operation: 'delete',
    actor,
    isReversible: false,
    execute: (tx) => tx.delete(orders).where(eq(orders.id, orderId)),
  });
  await triggerAdminReportingRefresh('order-delete');
  return {
    id: orderId,
    customerName: existing.fullName,
    phoneNumber: existing.phoneNumber1,
    status: existing.inHouseStatus,
  };
}
