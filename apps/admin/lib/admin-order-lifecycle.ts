import { and, desc, eq, gte } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orders } from '@bric/db/schema';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';
import {
  createPublicOrderToken,
  createPublicOrderTokenExpiry,
} from '@bric/storefront-core/order-access';
import { resolveOrderCommercialState } from '@bric/storefront-core/order-commercial';
import { storefrontOrderCreateSchema } from '@bric/storefront-core/order-domain';
import { insertCanonicalOrder } from '@bric/storefront-core/order-write';

import { mutateEntityWithHistoryTransaction, type ActionActor } from './action-history';
import {
  runIdempotentAdminMutation,
  type AdminMutationTransaction,
} from './admin-mutation-idempotency';
import { loadOrderDetail } from './admin-orders-data';
import { readEcotrackCatalog, resolveEcotrackDeliveryFee } from './ecotrack';
import { assertNoUnresolvedEcotrackMutation } from './ecotrack-mutations';
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
  requestId?: string,
) {
  const data = storefrontOrderCreateSchema.parse(input);
  const create = async (tx: AdminMutationTransaction) => {
    const normalizedPhone = normalizeAlgeriaPhone(data.phoneNumber1);
    const [commercial, catalog] = await Promise.all([
      resolveOrderCommercialState(tx, {
        cartProducts: data.cartProducts,
        promoCode: data.promoCode,
        now,
      }),
      data.state == null ? Promise.resolve(null) : readEcotrackCatalog(tx),
    ]);
    const deliveryFee = catalog
      ? resolveEcotrackDeliveryFee(catalog, data.state, data.delivery)
      : 0;
    const degraded =
      commercial.lines.length === 0 ||
      data.state == null ||
      !data.city ||
      (data.delivery === 0 && !data.homeAddress);
    const duplicateCandidates = normalizedPhone
      ? await tx
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

    const created = await mutateEntityWithHistoryTransaction(tx, {
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
            publicTokenExpiresAt: createPublicOrderTokenExpiry(now),
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
    return {
      orderId: created.order.id,
      duplicateCandidates: duplicateCandidates.map((candidate) => ({
        id: candidate.id,
        createdAt: candidate.createdAt.toISOString(),
      })),
    };
  };
  const result = requestId
    ? await runIdempotentAdminMutation(db, {
        scope: `phone-order-create:${actor?.email ?? 'operator'}`,
        requestId,
        payload: data,
        execute: create,
      })
    : { value: await db.transaction(create), replayed: false };
  const item = await loadOrderDetail(result.value.orderId, db);
  if (!item) throw new AdminOrderLifecycleNotFoundError(result.value.orderId);
  if (!result.replayed) await triggerAdminReportingRefresh('order-create');
  return { item, duplicateCandidates: result.value.duplicateCandidates };
}

export async function deleteAdminOrder(db: Database, orderId: number, actor?: ActionActor) {
  const existing = await loadOrderDetail(orderId, db);
  if (!existing) throw new AdminOrderLifecycleNotFoundError(orderId);
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new AdminOrderLifecycleNotFoundError(orderId);
    await assertNoUnresolvedEcotrackMutation(tx, orderId);
    const activeShipment = await tx.query.ecotrackOrderStates.findFirst({
      columns: { trackingNumber: true },
      where: (state, { and, eq, isNull }) =>
        and(eq(state.orderId, orderId), isNull(state.deletedAt)),
    });
    if (activeShipment)
      throw new AdminOrderHasActiveEcotrackShipmentError(orderId, activeShipment.trackingNumber);
    await mutateEntityWithHistoryTransaction(tx, {
      entityType: 'orders',
      entityId: orderId,
      operation: 'delete',
      actor,
      isReversible: false,
      execute: (tx) => tx.delete(orders).where(eq(orders.id, orderId)),
    });
  });
  await triggerAdminReportingRefresh('order-delete');
  return {
    id: orderId,
    customerName: existing.fullName,
    phoneNumber: existing.phoneNumber1,
    status: existing.inHouseStatus,
  };
}
