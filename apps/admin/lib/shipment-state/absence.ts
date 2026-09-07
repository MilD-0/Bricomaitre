import { ecotrackOrderStates, orders } from '@bric/db/schema';
import {
  getEcotrackOrder,
  getEcotrackTrackingsInfo,
  type EcotrackStatusItem,
  type EcotrackTrackingInfo,
} from '@bric/storefront-core/ecotrack-client';
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';
import { and, eq, isNull } from 'drizzle-orm';
import type { ActionActor } from '../action-history';
import {
  recordEcotrackOrderAction,
  recordEcotrackShipmentAction,
} from '../admin-ecotrack-shipment-audit';
import {
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from '../ecotrack-action-snapshots';
import { loadUnresolvedEcotrackMutation } from '../ecotrack-mutations';
import { isEcotrackTrackingInfoUnavailableError } from '../ecotrack-shipment-errors';
import { providerRequestOptions } from '../ecotrack-shipment-evidence';
import { MISSING_STATUS_RETIRE_MS } from '../ecotrack-shipment-policy';
import type {
  EcotrackDatabase as Database,
  EcotrackShipmentRow as ShipmentRow,
} from '../ecotrack-shipment-types';
import { coerceOrderStatus, ORDER_STATUS } from '../orders';

export function shouldRetireShipmentMissingFromStatusFeed(
  row: Pick<ShipmentRow, 'lastStatusSyncedAt' | 'createdAt'>,
  now = new Date(),
) {
  const lastAuthoritativeStatusAt = row.lastStatusSyncedAt ?? row.createdAt;
  return now.getTime() - lastAuthoritativeStatusAt.getTime() >= MISSING_STATUS_RETIRE_MS;
}

export async function confirmShipmentStatusFromCurrentOrders(row: ShipmentRow) {
  const response = await getEcotrackOrder(row.trackingNumber, {
    ...providerRequestOptions(row),
    startDate: row.createdAt.toISOString().slice(0, 10),
  });

  return response.data
    ? ({ status: response.data.status, activity: [] } satisfies EcotrackStatusItem)
    : null;
}

export async function softDeleteShipmentRow(
  db: Database,
  row: ShipmentRow,
  options: {
    actor?: ActionActor | null;
    operation?: 'update' | 'delete';
    restorePostedOrderToConfirmed?: boolean;
  } = {},
) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [currentOrder] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, row.order.id))
      .for('update');
    if (await loadUnresolvedEcotrackMutation(tx, row.order.id)) return false;
    // The provider call happened before this transaction. Do not overwrite an
    // operator or carrier update that arrived while that request was in flight.
    if (
      !currentOrder ||
      currentOrder.ecotrackTrackingNumber !== row.trackingNumber ||
      (options.restorePostedOrderToConfirmed &&
        (currentOrder.updatedAt.getTime() !== row.order.updatedAt.getTime() ||
          coerceOrderStatus(currentOrder.inHouseStatus) !==
            coerceOrderStatus(row.order.inHouseStatus)))
    )
      return false;
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
    const [deletedShipment] = await tx
      .update(ecotrackOrderStates)
      .set({
        deletedAt: now,
        lastActionAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(ecotrackOrderStates.id, row.id),
          eq(ecotrackOrderStates.trackingNumber, row.trackingNumber),
          isNull(ecotrackOrderStates.deletedAt),
        ),
      )
      .returning();

    if (!deletedShipment) {
      return false;
    }

    const restoreToConfirmed =
      options.restorePostedOrderToConfirmed &&
      (coerceOrderStatus(currentOrder.inHouseStatus) === ORDER_STATUS.POSTED ||
        coerceOrderStatus(currentOrder.inHouseStatus) === ORDER_STATUS.DISPATCHED);
    const updated = await updateCanonicalOrder(tx, {
      orderId: row.order.id,
      status: restoreToConfirmed ? { value: ORDER_STATUS.CONFIRMED, noAnswerCount: 0 } : undefined,
      allowStatusCorrection: options.restorePostedOrderToConfirmed,
      actor: options.actor ?? undefined,
      values: {
        ecotrackStatus: null,
        ecotrackStatusLastUpdate: null,
        ecotrackStatusData: null,
        ecotrackReference: null,
        ecotrackTrackingNumber: null,
      },
      now,
    });

    const afterOrderState = buildEcotrackOrderActionSnapshot(updated.order);
    const afterShipmentState = buildEcotrackShipmentActionSnapshot(deletedShipment);

    await recordEcotrackOrderAction(tx, beforeOrderState, afterOrderState, options.actor);
    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      options.actor,
      options.operation ?? 'delete',
    );

    return true;
  });
}

export async function getEcotrackTrackingsInfoAllowingUnavailable(
  trackings: string[],
  options?: Parameters<typeof getEcotrackTrackingsInfo>[1],
) {
  try {
    const response = options
      ? await getEcotrackTrackingsInfo(trackings, options)
      : await getEcotrackTrackingsInfo(trackings);
    return {
      data: response.data,
      rawData: response.rawData,
      unavailable: false,
    };
  } catch (error) {
    if (!isEcotrackTrackingInfoUnavailableError(error)) {
      throw error;
    }

    return {
      data: new Map<string, EcotrackTrackingInfo>(),
      rawData: new Map<string, unknown>(),
      unavailable: true,
    };
  }
}
