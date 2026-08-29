import {
  getEcotrackMaj,
  getEcotrackOrdersStatus,
  getEcotrackTrackingsInfo,
  type EcotrackMajEntry as UpstreamEcotrackMajEntry,
} from '@bric/storefront-core/ecotrack-client';
import { getDb } from '@bric/db/client';

import type { ActionActor } from './action-history';
import { providerRequestOptions } from './ecotrack-shipment-evidence';
import {
  rawOrderInfoFromTrackingPayload,
  resolveEcotrackStatusEvidence,
} from './ecotrack-shipment-status';
import type { EcotrackShipmentRow as ShipmentRow } from './ecotrack-shipment-types';
import {
  MISSING_STATUS_CONFIRMATION_LIMIT,
  TERMINAL_STATUSES,
  confirmShipmentStatusFromCurrentOrders,
  isStaleAt,
  loadActiveShipmentRows,
  shouldRetireShipmentMissingFromStatusFeed,
  softDeleteShipmentRow,
  upsertShipmentState,
} from './admin-ecotrack-shipment-state';

export async function syncEcotrackShipmentStates(
  options: {
    includeMaj?: boolean;
    actor?: ActionActor | null;
  } = {},
) {
  const db = getDb();
  const rows = await loadActiveShipmentRows(db);
  const candidates = rows.filter(
    (row) =>
      !TERMINAL_STATUSES.has(row.currentStatus) ||
      isStaleAt(row.lastStatusSyncedAt, 7 * 24 * 60 * 60 * 1000) ||
      row.currentAmountSource !== 'ecotrack_orders' ||
      row.deliveryTariff === null,
  );

  const batches: ShipmentRow[][] = [];
  for (const provider of ['delivro', 'emir'] as const) {
    const providerRows = candidates.filter(
      (row) => (row.provider === 'emir' ? 'emir' : 'delivro') === provider,
    );
    for (let index = 0; index < providerRows.length; index += 100) {
      batches.push(providerRows.slice(index, index + 100));
    }
  }

  let synced = 0;
  let missing = 0;
  let retired = 0;
  let fallbackChecked = 0;
  let fallbackRecovered = 0;
  let fallbackDeferred = 0;
  let superseded = 0;
  let failed = 0;
  let batchFailed = 0;
  let majFailed = 0;
  for (const batch of batches) {
    const trackingNumbers = batch.map((row) => row.trackingNumber);
    let statusResponse: Awaited<ReturnType<typeof getEcotrackOrdersStatus>>;
    let trackingResponse: Awaited<ReturnType<typeof getEcotrackTrackingsInfo>>;
    try {
      [statusResponse, trackingResponse] = await Promise.all([
        getEcotrackOrdersStatus(trackingNumbers, 'all', providerRequestOptions(batch[0])),
        getEcotrackTrackingsInfo(trackingNumbers, providerRequestOptions(batch[0])),
      ]);
    } catch {
      failed += batch.length;
      batchFailed += batch.length;
      continue;
    }

    for (const row of batch) {
      const trackingInfo = trackingResponse.data.get(row.trackingNumber) ?? null;
      const rawTrackingInfo =
        trackingResponse.rawData?.get(row.trackingNumber) ?? trackingInfo ?? null;
      let statusItem = resolveEcotrackStatusEvidence(
        statusResponse.data.get(row.trackingNumber),
        trackingInfo,
      );
      if (!statusItem && shouldRetireShipmentMissingFromStatusFeed(row)) {
        if (fallbackChecked >= MISSING_STATUS_CONFIRMATION_LIMIT) {
          fallbackDeferred += 1;
        } else {
          fallbackChecked += 1;
          try {
            statusItem = await confirmShipmentStatusFromCurrentOrders(row);
            if (statusItem) {
              fallbackRecovered += 1;
            } else {
              const deleted = await softDeleteShipmentRow(db, row, {
                actor: options.actor,
                operation: 'delete',
              });
              if (deleted) {
                retired += 1;
              } else {
                superseded += 1;
              }
              continue;
            }
          } catch {
            failed += 1;
            continue;
          }
        }
      }

      let majEntries: UpstreamEcotrackMajEntry[] | null = null;
      let rawMajEntries: unknown = null;
      // MAJ is a per-shipment endpoint subject to the provider's global request
      // pacing. A scheduled reconciliation can contain thousands of shipments,
      // so refreshing stale MAJ entries here would turn a 15-minute status job
      // into an hours-long serial crawl. Keep the periodic path bounded to the
      // batched status/tracking endpoints; explicit and visible-page refreshes
      // continue to request MAJ data through their on-demand paths.
      if (options.includeMaj === true) {
        try {
          const majResponse = await getEcotrackMaj(row.trackingNumber, providerRequestOptions(row));
          majEntries = majResponse.data;
          rawMajEntries = majResponse.payload;
        } catch {
          // Status and tracking history remain useful when the optional MAJ feed
          // rejects one old or provider-incompatible tracking number.
          majFailed += 1;
        }
      }

      try {
        const applied = await upsertShipmentState(
          db,
          row,
          {
            statusItem,
            rawStatusItem: statusResponse.rawData?.get(row.trackingNumber) ?? statusItem,
            trackingInfo,
            rawTrackingInfo,
            majEntries,
            rawMajEntries,
            orderInfo: trackingInfo?.OrderInfo ?? null,
            rawOrderInfo: rawOrderInfoFromTrackingPayload(rawTrackingInfo),
          },
          options.actor,
        );
        if (!applied) {
          superseded += 1;
          continue;
        }
        if (statusItem) {
          synced += 1;
        } else {
          missing += 1;
        }
      } catch {
        failed += 1;
      }
    }
  }

  if (candidates.length > 0 && synced + missing + retired === 0 && failed > 0) {
    throw new Error(`ECOTRACK shipment sync failed for all ${failed} candidates.`);
  }

  return {
    total: candidates.length,
    synced,
    missing,
    retired,
    fallbackChecked,
    fallbackRecovered,
    fallbackDeferred,
    superseded,
    failed,
    batchFailed,
    majFailed,
  };
}
