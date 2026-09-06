import type { getDb } from '@bric/db/client';
import { ecotrackOrderStates, orders } from '@bric/db/schema';
import type { ResolvedOrderCommercialState } from '@bric/storefront-core/order-commercial';
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';
import { eq } from 'drizzle-orm';
import { recordExplicitActionLog } from './action-history';
import { recordEcotrackShipmentAction } from './admin-ecotrack-shipment-audit';
import { buildEcotrackShipmentActionSnapshot } from './ecotrack-action-snapshots';
import { applyEcotrackMutation, type CarrierMutation } from './ecotrack-mutations';
import type { EcotrackCreateOrderResult } from './ecotrack-posting';
import { persistEcotrackPostedOrderInTransaction } from './ecotrack-posting-persistence';
import { ORDER_STATUS, coerceOrderStatus, type OrderRecord } from './orders';

export type CarrierOrderChange = {
  values: Parameters<typeof updateCanonicalOrder>[1]['values'];
  commercial?: ResolvedOrderCommercialState;
  deliveryFee?: number;
  totals: NonNullable<Parameters<typeof updateCanonicalOrder>[1]['totals']>;
};

export async function applySavedEcotrackMutation(
  db: ReturnType<typeof getDb>,
  operation: CarrierMutation,
) {
  return applyEcotrackMutation(db, operation, async (tx) => {
    const [before] = await tx.select().from(orders).where(eq(orders.id, operation.orderId));
    if (!before) throw new Error('Order no longer exists.');
    const [shipment] = await tx
      .select()
      .from(ecotrackOrderStates)
      .where(eq(ecotrackOrderStates.orderId, operation.orderId));
    const now = new Date();
    const desired = operation.request.desired as CarrierOrderChange | undefined;
    let updated = before;
    if (desired) {
      updated = (
        await updateCanonicalOrder(tx, {
          orderId: before.id,
          ...desired,
          actor: operation.actor,
          now,
        })
      ).order;
    }
    if (operation.kind === 'post' || operation.kind === 'recreate') {
      await persistEcotrackPostedOrderInTransaction(
        tx,
        {
          row: updated,
          record: operation.request.record as OrderRecord,
        },
        operation.actor,
        operation.response as EcotrackCreateOrderResult,
        operation.provider === 'emir' ? 'emir' : 'delivro',
      );
    } else {
      if (!shipment || shipment.trackingNumber !== operation.trackingNumber || shipment.deletedAt)
        throw new Error('Carrier shipment changed before the saved response could be applied.');
      if (operation.kind === 'delete') {
        const status = coerceOrderStatus(before.inHouseStatus);
        updated = (
          await updateCanonicalOrder(tx, {
            orderId: before.id,
            actor: operation.actor,
            now,
            status:
              status === ORDER_STATUS.POSTED || status === ORDER_STATUS.DISPATCHED
                ? { value: ORDER_STATUS.CONFIRMED }
                : undefined,
            allowStatusCorrection: true,
            values: {
              ecotrackReference: null,
              ecotrackTrackingNumber: null,
              ecotrackStatus: null,
              ecotrackStatusLastUpdate: null,
              ecotrackStatusData: null,
            },
          })
        ).order;
      } else if (operation.kind === 'dispatch') {
        updated = (
          await updateCanonicalOrder(tx, {
            orderId: before.id,
            status: { value: ORDER_STATUS.DISPATCHED },
            actor: operation.actor,
            now,
          })
        ).order;
      }
      const [savedShipment] = await tx
        .update(ecotrackOrderStates)
        .set({
          lastActionAt: now,
          updatedAt: now,
          lastStatusSyncedAt: null,
          lastOrderSyncedAt: null,
          ...(operation.kind === 'maj' ? { lastMajSyncedAt: null } : {}),
          ...(desired
            ? {
                currentAmount: updated.totalAmount,
                currentAmountSource: 'submitted_order',
                stopDesk: updated.delivery === 1,
              }
            : {}),
          ...(operation.kind === 'delete' ? { deletedAt: now } : {}),
        })
        .where(eq(ecotrackOrderStates.id, shipment.id))
        .returning();
      await recordEcotrackShipmentAction(
        tx,
        before.id,
        buildEcotrackShipmentActionSnapshot(shipment),
        buildEcotrackShipmentActionSnapshot(savedShipment!),
        operation.actor,
        operation.kind === 'delete' ? 'delete' : 'update',
      );
    }
    if (desired || operation.kind === 'delete' || operation.kind === 'dispatch') {
      [updated] = await tx.select().from(orders).where(eq(orders.id, before.id));
      await recordExplicitActionLog(tx, {
        entityType: 'orders',
        entityId: before.id,
        operation: 'update',
        beforeState: before,
        afterState: updated,
        actor: operation.actor,
        isReversible: false,
      });
    }
  });
}
