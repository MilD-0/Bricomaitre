import { getEcotrackMaj, getEcotrackOrdersStatus } from '@bric/storefront-core/ecotrack-client';
import type { ActionActor } from '../action-history';
import {
  buildEcotrackOrderDetailFromRow,
  isStaleAt,
  loadShipmentRowByOrderId,
} from '../admin-ecotrack-shipment-view';
import { providerRequestOptions } from '../ecotrack-shipment-evidence';
import { MAJ_STALE_MS, STATUS_STALE_MS, TRACKING_STALE_MS } from '../ecotrack-shipment-policy';
import {
  rawOrderInfoFromTrackingPayload,
  resolveEcotrackStatusEvidence,
} from '../ecotrack-shipment-status';
import type {
  EcotrackDatabase as Database,
  EcotrackShipmentRow as ShipmentRow,
} from '../ecotrack-shipment-types';
import {
  confirmShipmentStatusFromCurrentOrders,
  getEcotrackTrackingsInfoAllowingUnavailable,
  shouldRetireShipmentMissingFromStatusFeed,
  softDeleteShipmentRow,
} from './absence';
import { upsertShipmentState } from './persist';

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
      : getEcotrackTrackingsInfoAllowingUnavailable(
          [row.trackingNumber],
          providerRequestOptions(row),
        ),
    options.includeMaj === false
      ? Promise.resolve(null)
      : getEcotrackMaj(row.trackingNumber, providerRequestOptions(row)).catch(() => null),
  ]);

  const trackingInfo = trackingResponse?.data.get(row.trackingNumber) ?? null;
  const rawTrackingInfo =
    trackingResponse?.rawData?.get(row.trackingNumber) ?? trackingInfo ?? null;
  let statusItem = resolveEcotrackStatusEvidence(
    statusResponse.data.get(row.trackingNumber),
    trackingInfo,
  );
  if (
    !statusItem &&
    (trackingResponse?.unavailable || shouldRetireShipmentMissingFromStatusFeed(row))
  ) {
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
