import { eq } from 'drizzle-orm';

import { ecotrackOrderStates, orders } from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';
import {
  recordEcotrackOrderAction,
  recordEcotrackShipmentAction,
} from './admin-ecotrack-shipment-audit';
import {
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from './ecotrack-action-snapshots';
import type { CarrierTransaction } from './ecotrack-mutations';
import type { EcotrackCreateOrderResult, EcotrackOrderInput } from './ecotrack-posting';
import type { EcotrackProvider } from './ecotrack-provider';
import { coerceOrderStatus } from './orders';

export async function persistEcotrackPostedOrderInTransaction(
  tx: CarrierTransaction,
  input: EcotrackOrderInput,
  actor: { email?: string | null; name?: string | null },
  createResult: EcotrackCreateOrderResult,
  provider: EcotrackProvider = 'delivro',
) {
  const now = new Date();
  const [currentOrder] = await tx
    .select()
    .from(orders)
    .where(eq(orders.id, input.row.id))
    .for('update');
  if (!currentOrder) throw new Error('Order no longer exists.');
  const [existingShipment] = await tx
    .select()
    .from(ecotrackOrderStates)
    .where(eq(ecotrackOrderStates.orderId, input.row.id))
    .limit(1);
  const beforeShipmentState = existingShipment
    ? buildEcotrackShipmentActionSnapshot(existingShipment)
    : null;

  const { previous, order } = await updateCanonicalOrder(tx, {
    orderId: input.row.id,
    status: {
      value:
        existingShipment &&
        !existingShipment.deletedAt &&
        existingShipment.trackingNumber === createResult.tracking
          ? coerceOrderStatus(currentOrder.inHouseStatus)
          : ORDER_STATUS.POSTED,
      noAnswerCount: 0,
    },
    actor,
    now,
    allowStatusCorrection: Boolean(existingShipment),
    values: {
      ecotrackReference: String(input.row.id),
      ecotrackTrackingNumber: createResult.tracking,
      ecotrackStatus: 'prete_a_expedier',
      ecotrackStatusLastUpdate: now,
      ecotrackStatusData: {
        source: 'admin_direct_post',
        create: createResult.raw,
        currentStatus: 'prete_a_expedier',
        updatedAt: now.toISOString(),
      },
      confirmedBy: currentOrder.confirmedBy ?? actor.email ?? null,
      confirmedByName: currentOrder.confirmedByName ?? actor.name ?? null,
      confirmedAt: currentOrder.confirmedAt ?? now,
    },
  });

  const shipmentValues = {
    orderId: input.row.id,
    reference: String(input.row.id),
    trackingNumber: createResult.tracking ?? '',
    provider,
    currentStatus: 'prete_a_expedier',
    currentAmount: String(input.record.totalAmount),
    currentAmountSource: 'submitted_order',
    deliveryTariff: null,
    returnTariff: null,
    stopDesk: input.record.delivery === 1,
    paymentId: null,
    statusReason: null,
    providerCreatedAt: now,
    providerUpdatedAt: null,
    driverPhone: null,
    estimatedFee: null,
    deskPhone: null,
    deskCommune: null,
    deskMapLink: null,
    deskAddress: null,
    rawCreatePayload: createResult.raw,
    rawStatusPayload: {
      currentStatus: 'prete_a_expedier',
      createMessage: createResult.message ?? null,
    },
    rawLastTrackingPayload: null,
    rawLastMajPayload: null,
    rawOrderPayload: null,
    lastStatusSyncedAt: null,
    lastTrackingSyncedAt: null,
    lastMajSyncedAt: null,
    lastOrderSyncedAt: null,
    deletedAt: null,
    lastActionAt: now,
    createdAt: now,
    updatedAt: now,
  } satisfies typeof ecotrackOrderStates.$inferInsert;
  const [shipment] = await tx
    .insert(ecotrackOrderStates)
    .values(shipmentValues)
    .onConflictDoUpdate({ target: ecotrackOrderStates.orderId, set: shipmentValues })
    .returning();
  if (!shipment) throw new Error('Posted shipment could not be persisted.');

  await recordEcotrackOrderAction(
    tx,
    buildEcotrackOrderActionSnapshot(previous),
    buildEcotrackOrderActionSnapshot(order),
    actor,
  );
  await recordEcotrackShipmentAction(
    tx,
    input.row.id,
    beforeShipmentState,
    buildEcotrackShipmentActionSnapshot(shipment),
    actor,
    beforeShipmentState ? 'update' : 'create',
  );
}
