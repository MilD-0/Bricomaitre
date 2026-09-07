import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orders,
} from '@bric/db/schema';
import {
  type EcotrackOrderInfo,
  type EcotrackOrderSummary,
  type EcotrackStatusItem,
  type EcotrackTrackingInfo,
  type EcotrackMajEntry as UpstreamEcotrackMajEntry,
} from '@bric/storefront-core/ecotrack-client';
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';
import { and, eq, isNull } from 'drizzle-orm';
import type { ActionActor } from '../action-history';
import {
  ECOTRACK_SYNC_ACTOR_NAME,
  loadMajSyncSummary,
  loadTrackingSyncSummary,
  recordEcotrackMajAction,
  recordEcotrackOrderAction,
  recordEcotrackShipmentAction,
  recordEcotrackTrackingAction,
} from '../admin-ecotrack-shipment-audit';
import {
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from '../ecotrack-action-snapshots';
import { loadUnresolvedEcotrackMutation } from '../ecotrack-mutations';
import {
  mapMajEntry,
  mapTrackingInfoEvents,
  persistStatusEvidence,
} from '../ecotrack-shipment-evidence';
import {
  deriveLatestUpstreamActivityAt,
  getUpstreamTrackingValues,
  mapEcotrackOrderSnapshot,
  mapEcotrackStatusToOrderStatus,
} from '../ecotrack-shipment-status';
import type {
  EcotrackDatabase as Database,
  EcotrackShipmentRow as ShipmentRow,
} from '../ecotrack-shipment-types';
import { coerceOrderStatus } from '../orders';

export async function upsertShipmentState(
  db: Database,
  row: ShipmentRow,
  payload: {
    statusItem?: EcotrackStatusItem | null;
    rawStatusItem?: unknown;
    trackingInfo?: EcotrackTrackingInfo | null;
    rawTrackingInfo?: unknown;
    majEntries?: UpstreamEcotrackMajEntry[] | null;
    rawMajEntries?: unknown;
    orderInfo?: EcotrackOrderInfo | EcotrackOrderSummary | null;
    rawOrderInfo?: unknown;
  },
  actor?: ActionActor | null,
) {
  const now = new Date();
  const updates: Partial<typeof ecotrackOrderStates.$inferInsert> = {
    updatedAt: now,
  };

  const possibleOrderInfoStatus = payload.orderInfo
    ? (payload.orderInfo as Record<string, unknown>).status
    : null;
  const statusCandidate = payload.trackingInfo?.status ?? possibleOrderInfoStatus;
  const orderInfoStatus =
    typeof statusCandidate === 'string' && statusCandidate.trim() ? statusCandidate.trim() : null;
  const statusItem =
    payload.statusItem ??
    (orderInfoStatus
      ? ({ status: orderInfoStatus, activity: [] } satisfies EcotrackStatusItem)
      : null);

  if (statusItem) {
    const current = getUpstreamTrackingValues(statusItem);
    updates.currentStatus = current.currentStatus;
    updates.driverPhone = current.driverPhone;
    updates.estimatedFee = current.estimatedFee;
    updates.deskPhone = current.deskPhone;
    updates.deskCommune = current.deskCommune;
    updates.deskMapLink = current.deskMapLink;
    updates.deskAddress = current.deskAddress;
    updates.rawStatusPayload = payload.rawStatusItem ?? statusItem;
    updates.lastStatusSyncedAt = now;
  }

  if (payload.orderInfo) {
    Object.assign(updates, mapEcotrackOrderSnapshot(payload.orderInfo));
    updates.rawOrderPayload = payload.rawOrderInfo ?? payload.orderInfo;
    updates.lastOrderSyncedAt = now;
  }

  if (payload.trackingInfo) {
    updates.rawLastTrackingPayload = payload.rawTrackingInfo ?? payload.trackingInfo;
    updates.lastTrackingSyncedAt = now;
  }

  if (payload.majEntries) {
    updates.rawLastMajPayload = payload.rawMajEntries ?? payload.majEntries;
    updates.lastMajSyncedAt = now;
  }

  return db.transaction(async (tx) => {
    const [currentOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, row.order.id))
      .for('update');
    if (!currentOrder || (await loadUnresolvedEcotrackMutation(tx, row.order.id))) return false;
    const beforeOrderState = buildEcotrackOrderActionSnapshot(currentOrder);
    const [currentShipment] = await tx
      .select()
      .from(ecotrackOrderStates)
      .where(eq(ecotrackOrderStates.id, row.id))
      .for('update');
    if (
      !currentShipment ||
      currentShipment.trackingNumber !== row.trackingNumber ||
      currentShipment.deletedAt
    )
      return false;
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(currentShipment);
    const beforeMajState = payload.majEntries
      ? await loadMajSyncSummary(tx, row.order.id, row.trackingNumber)
      : null;
    const beforeTrackingState = payload.trackingInfo
      ? await loadTrackingSyncSummary(tx, row.order.id, row.trackingNumber)
      : null;

    const [updatedShipment] = await tx
      .update(ecotrackOrderStates)
      .set(updates)
      .where(
        and(
          eq(ecotrackOrderStates.id, row.id),
          eq(ecotrackOrderStates.trackingNumber, row.trackingNumber),
          isNull(ecotrackOrderStates.deletedAt),
        ),
      )
      .returning();

    if (!updatedShipment) {
      return false;
    }

    if (statusItem) {
      await persistStatusEvidence(tx, row, {
        statusItem,
        orderInfo: payload.orderInfo,
        observedAt: now,
      });
    }

    const nextLocalStatus = statusItem
      ? mapEcotrackStatusToOrderStatus(
          statusItem.status,
          deriveLatestUpstreamActivityAt(row, payload),
        )
      : null;
    const currentLocalStatus = coerceOrderStatus(currentOrder.inHouseStatus);
    let savedOrder = currentOrder;

    if (statusItem) {
      const nextOrderValues: Partial<typeof orders.$inferInsert> = {
        ecotrackStatus: statusItem.status,
        ecotrackStatusLastUpdate: now,
        ecotrackStatusData: payload.rawStatusItem ?? payload.rawOrderInfo ?? statusItem,
        updatedAt: now,
      };

      const orderResult = await updateCanonicalOrder(tx, {
        orderId: row.order.id,
        values: nextOrderValues,
        status:
          nextLocalStatus !== null && nextLocalStatus !== currentLocalStatus
            ? { value: nextLocalStatus, noAnswerCount: 0 }
            : undefined,
        actor: { name: ECOTRACK_SYNC_ACTOR_NAME },
        now,
      });
      savedOrder = orderResult.order;
    }

    if (payload.majEntries) {
      const majValues = payload.majEntries.flatMap((entry) => {
        const mapped = mapMajEntry(entry);
        return mapped
          ? [
              {
                orderId: row.order.id,
                trackingNumber: row.trackingNumber,
                ...mapped,
                createdAt: now,
                updatedAt: now,
              },
            ]
          : [];
      });
      if (majValues.length > 0) {
        await tx.insert(ecotrackOrderMajEntries).values(majValues).onConflictDoNothing();
      }
    }

    if (payload.trackingInfo) {
      const trackingValues = mapTrackingInfoEvents(
        row.order.id,
        row.trackingNumber,
        payload.trackingInfo,
        payload.rawTrackingInfo,
      );
      if (trackingValues.length > 0) {
        await tx.insert(ecotrackOrderTrackingEvents).values(trackingValues).onConflictDoNothing();
      }
    }

    const afterOrderState = buildEcotrackOrderActionSnapshot(savedOrder);
    const afterShipmentState = buildEcotrackShipmentActionSnapshot(updatedShipment);

    await recordEcotrackOrderAction(tx, beforeOrderState, afterOrderState, actor);
    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
    if (beforeMajState) {
      const afterMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);
      await recordEcotrackMajAction(tx, row.order.id, beforeMajState, afterMajState, actor);
    }
    if (beforeTrackingState) {
      const afterTrackingState = await loadTrackingSyncSummary(
        tx,
        row.order.id,
        row.trackingNumber,
      );
      await recordEcotrackTrackingAction(
        tx,
        row.order.id,
        beforeTrackingState,
        afterTrackingState,
        actor,
      );
    }

    return true;
  });
}
