import { and, eq, isNull } from 'drizzle-orm';
import {
  getEcotrackMaj,
  getEcotrackOrder,
  getEcotrackOrdersStatus,
  getEcotrackTrackingsInfo,
  type EcotrackMajEntry as UpstreamEcotrackMajEntry,
  type EcotrackOrderInfo,
  type EcotrackOrderSummary,
  type EcotrackStatusItem,
  type EcotrackTrackingInfo,
} from '@bric/storefront-core/ecotrack-client';
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';

import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orders,
} from '@bric/db/schema';
import type { ActionActor } from './action-history';
import type {
  EcotrackBulkActionFailure,
  EcotrackBulkActionResponse,
  EcotrackDispatchBatchResponse,
  EcotrackLabelsResponse,
  EcotrackShipmentDetail,
  EcotrackShipmentsResponse,
} from './ecotrack-admin-contracts';
import {
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from './ecotrack-action-snapshots';
import { normalizeEcotrackMonetarySnapshotValue } from './ecotrack-monetary';
import { isEcotrackMissingTrackingInfoError } from './ecotrack-shipment-errors';
import {
  mapMajEntry,
  mapTrackingInfoEvents,
  persistStatusEvidence,
  providerRequestOptions,
} from './ecotrack-shipment-evidence';
import {
  deriveLatestUpstreamActivityAt,
  getUpstreamTrackingValues,
  mapEcotrackOrderSnapshot,
  mapEcotrackStatusToOrderStatus,
  rawOrderInfoFromTrackingPayload,
  resolveEcotrackStatusEvidence,
} from './ecotrack-shipment-status';
import type {
  EcotrackDatabase as Database,
  EcotrackShipmentRow as ShipmentRow,
} from './ecotrack-shipment-types';
import { coerceOrderStatus, isConfirmedLifecycleStatus, ORDER_STATUS } from './orders';
import {
  ECOTRACK_SYNC_ACTOR_NAME,
  loadMajSyncSummary,
  loadTrackingSyncSummary,
  recordEcotrackMajAction,
  recordEcotrackOrderAction,
  recordEcotrackShipmentAction,
  recordEcotrackTrackingAction,
} from './admin-ecotrack-shipment-audit';
import {
  buildEcotrackOrderDetailFromRow,
  isStaleAt,
  loadShipmentRowByOrderId,
} from './admin-ecotrack-shipment-view';
import {
  MAJ_STALE_MS,
  MISSING_STATUS_RETIRE_MS,
  STATUS_STALE_MS,
  TRACKING_STALE_MS,
} from './ecotrack-shipment-policy';

export * from './admin-ecotrack-shipment-audit';
export * from './admin-ecotrack-shipment-view';
export * from './ecotrack-shipment-policy';

export type EcotrackListLoadOptions = {
  ensureFreshVisiblePage?: boolean;
  actor?: ActionActor | null;
};

export type EcotrackOrderDetail = EcotrackShipmentDetail;

export type EcotrackRefreshFailure = EcotrackBulkActionFailure;
export type EcotrackRefreshBatchResult = EcotrackBulkActionResponse<EcotrackOrderDetail>;
export type EcotrackDispatchBatchResult = EcotrackDispatchBatchResponse;
export type EcotrackBulkLabelResult = EcotrackLabelsResponse;
export type EcotrackOrderListResponse = EcotrackShipmentsResponse;

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
  const beforeOrderState = buildEcotrackOrderActionSnapshot(row.order);
  const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);

  return db.transaction(async (tx) => {
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
      .returning({ id: ecotrackOrderStates.id });

    if (!deletedShipment) {
      return false;
    }

    const restoreToConfirmed =
      options.restorePostedOrderToConfirmed &&
      (coerceOrderStatus(row.order.inHouseStatus) === ORDER_STATUS.POSTED ||
        coerceOrderStatus(row.order.inHouseStatus) === ORDER_STATUS.DISPATCHED);
    await updateCanonicalOrder(tx, {
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

    const afterOrderState = {
      ...beforeOrderState,
      ...(restoreToConfirmed ? { inHouseStatus: ORDER_STATUS.CONFIRMED, noAnswerCount: 0 } : {}),
      ecotrackStatus: null,
      ecotrackStatusLastUpdate: null,
      ecotrackStatusData: null,
      ecotrackReference: null,
      ecotrackTrackingNumber: null,
      updatedAt: now,
    };
    const afterShipmentState = {
      ...beforeShipmentState,
      deletedAt: now,
      lastActionAt: now,
      updatedAt: now,
    };

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

export async function getEcotrackTrackingsInfoAllowingMissing(
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
      missing: new Set<string>(),
    };
  } catch (error) {
    if (!isEcotrackMissingTrackingInfoError(error)) {
      throw error;
    }

    return {
      data: new Map<string, EcotrackTrackingInfo>(),
      rawData: new Map<string, unknown>(),
      missing: new Set(trackings),
    };
  }
}

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
    const beforeOrderState = buildEcotrackOrderActionSnapshot(row.order);
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);
    const beforeMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);
    const beforeTrackingState = await loadTrackingSyncSummary(tx, row.order.id, row.trackingNumber);

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
      .returning({ id: ecotrackOrderStates.id });

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
    const currentLocalStatus = coerceOrderStatus(row.order.inHouseStatus);

    if (statusItem) {
      const nextOrderValues: Partial<typeof orders.$inferInsert> = {
        ecotrackStatus: statusItem.status,
        ecotrackStatusLastUpdate: now,
        ecotrackStatusData: payload.rawStatusItem ?? payload.rawOrderInfo ?? statusItem,
        updatedAt: now,
      };

      await updateCanonicalOrder(tx, {
        orderId: row.order.id,
        values: nextOrderValues,
        status:
          nextLocalStatus !== null && nextLocalStatus !== currentLocalStatus
            ? { value: nextLocalStatus, noAnswerCount: 0 }
            : undefined,
        actor: { name: ECOTRACK_SYNC_ACTOR_NAME },
        now,
      });
    }

    if (payload.majEntries) {
      const majValues = payload.majEntries.map((entry) => ({
        orderId: row.order.id,
        trackingNumber: row.trackingNumber,
        ...mapMajEntry(entry),
        createdAt: now,
        updatedAt: now,
      }));
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

    const afterOrderState = {
      ...beforeOrderState,
      ...(statusItem
        ? {
            ecotrackStatus: statusItem.status,
            ecotrackStatusLastUpdate: now,
            ecotrackStatusData: payload.rawStatusItem ?? payload.rawOrderInfo ?? statusItem,
            updatedAt: now,
          }
        : {}),
      ...(nextLocalStatus !== null && nextLocalStatus !== currentLocalStatus
        ? {
            inHouseStatus: nextLocalStatus,
            noAnswerCount: 0,
            confirmedBy: isConfirmedLifecycleStatus(nextLocalStatus)
              ? (row.order.confirmedBy ?? null)
              : null,
            confirmedByName: isConfirmedLifecycleStatus(nextLocalStatus)
              ? (row.order.confirmedByName ?? null)
              : null,
            confirmedAt: isConfirmedLifecycleStatus(nextLocalStatus)
              ? (row.order.confirmedAt ?? now)
              : null,
          }
        : {}),
    };
    const afterShipmentState = {
      ...beforeShipmentState,
      ...updates,
      estimatedFee:
        updates.estimatedFee === undefined
          ? beforeShipmentState.estimatedFee
          : normalizeEcotrackMonetarySnapshotValue(updates.estimatedFee),
    };
    const afterMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);
    const afterTrackingState = await loadTrackingSyncSummary(tx, row.order.id, row.trackingNumber);

    await recordEcotrackOrderAction(tx, beforeOrderState, afterOrderState, actor);
    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
    await recordEcotrackMajAction(tx, row.order.id, beforeMajState, afterMajState, actor);
    await recordEcotrackTrackingAction(
      tx,
      row.order.id,
      beforeTrackingState,
      afterTrackingState,
      actor,
    );

    return true;
  });
}

export async function refreshShipmentRow(
  db: Database,
  row: ShipmentRow,
  options: {
    includeMaj?: boolean;
    includeTracking?: boolean;
    actor?: ActionActor | null;
  } = {},
) {
  const [statusResponse, trackingResponse, majResponse] = await Promise.all([
    getEcotrackOrdersStatus([row.trackingNumber], 'all', providerRequestOptions(row)),
    options.includeTracking === false
      ? Promise.resolve(null)
      : getEcotrackTrackingsInfoAllowingMissing([row.trackingNumber], providerRequestOptions(row)),
    options.includeMaj === false
      ? Promise.resolve(null)
      : getEcotrackMaj(row.trackingNumber, providerRequestOptions(row)),
  ]);

  if (trackingResponse?.missing.has(row.trackingNumber)) {
    await softDeleteShipmentRow(db, row, { actor: options.actor, operation: 'delete' });
    return null;
  }

  const trackingInfo = trackingResponse?.data.get(row.trackingNumber) ?? null;
  const rawTrackingInfo =
    trackingResponse?.rawData?.get(row.trackingNumber) ?? trackingInfo ?? null;
  let statusItem = resolveEcotrackStatusEvidence(
    statusResponse.data.get(row.trackingNumber),
    trackingInfo,
  );
  if (!statusItem && shouldRetireShipmentMissingFromStatusFeed(row)) {
    statusItem = await confirmShipmentStatusFromCurrentOrders(row);
    if (!statusItem) {
      await softDeleteShipmentRow(db, row, { actor: options.actor, operation: 'delete' });
      return null;
    }
  }

  await upsertShipmentState(
    db,
    row,
    {
      statusItem,
      rawStatusItem: statusResponse.rawData?.get(row.trackingNumber) ?? statusItem,
      trackingInfo,
      rawTrackingInfo,
      majEntries: majResponse?.data ?? null,
      rawMajEntries: majResponse?.payload ?? null,
      orderInfo: trackingInfo?.OrderInfo ?? null,
      rawOrderInfo: rawOrderInfoFromTrackingPayload(rawTrackingInfo),
    },
    options.actor,
  );

  const refreshedRow = await loadShipmentRowByOrderId(db, row.order.id);
  return refreshedRow ? buildEcotrackOrderDetailFromRow(db, refreshedRow) : null;
}

export async function ensureFreshShipmentRow(
  db: Database,
  row: ShipmentRow,
  options: {
    includeMaj?: boolean;
    includeTracking?: boolean;
    actor?: ActionActor | null;
  } = {},
) {
  const mustRefresh =
    isStaleAt(row.lastStatusSyncedAt, STATUS_STALE_MS) ||
    (options.includeTracking !== false && isStaleAt(row.lastTrackingSyncedAt, TRACKING_STALE_MS)) ||
    (options.includeMaj !== false && isStaleAt(row.lastMajSyncedAt, MAJ_STALE_MS));

  if (!mustRefresh) {
    return buildEcotrackOrderDetailFromRow(db, row);
  }

  return refreshShipmentRow(db, row, options);
}
