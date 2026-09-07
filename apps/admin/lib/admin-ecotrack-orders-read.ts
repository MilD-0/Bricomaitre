import { getDb, hasDb } from '@bric/db/client';
import { getEcotrackMaj, getEcotrackOrdersStatus } from '@bric/storefront-core/ecotrack-client';

import type { ActionActor } from './action-history';
import {
  buildListItems,
  confirmShipmentStatusFromCurrentOrders,
  ensureFreshShipmentRow,
  getEcotrackTrackingsInfoAllowingUnavailable,
  loadActiveShipmentPageRows,
  loadShipmentRowByOrderId,
  refreshShipmentRow,
  shouldRetireShipmentMissingFromStatusFeed,
  softDeleteShipmentRow,
  upsertShipmentState,
  type EcotrackListLoadOptions,
  type EcotrackOrderDetail,
  type EcotrackOrderListResponse,
  type EcotrackRefreshBatchResult,
  type EcotrackRefreshFailure,
} from './admin-ecotrack-shipment-state';
import { readEcotrackCatalog } from './ecotrack-catalog';
import { formatEcotrackActionError, toEcotrackFailureRecord } from './ecotrack-shipment-errors';
import { providerRequestOptions } from './ecotrack-shipment-evidence';
import {
  parseEcotrackShipmentListQuery,
  type EcotrackShipmentListQueryInput,
} from './ecotrack-shipment-list';
import {
  rawOrderInfoFromTrackingPayload,
  resolveEcotrackStatusEvidence,
} from './ecotrack-shipment-status';
import type { EcotrackShipmentRow as ShipmentRow } from './ecotrack-shipment-types';
import { getOrderProductLookup } from './order-records';
import {
  buildEcotrackOrderDetailsFromRows,
  loadShipmentRowsByOrderIds,
} from './admin-ecotrack-shipment-view';

export type {
  EcotrackOrderDetail,
  EcotrackOrderListResponse,
  EcotrackRefreshBatchResult,
} from './admin-ecotrack-shipment-state';

export async function loadEcotrackOrdersPageData(
  input: EcotrackShipmentListQueryInput,
  writable: boolean,
  options: EcotrackListLoadOptions = {},
): Promise<EcotrackOrderListResponse> {
  if (!hasDb()) {
    return {
      writable: false,
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  const db = getDb();
  const query = parseEcotrackShipmentListQuery(input);
  const [pageData, catalog] = await Promise.all([
    loadActiveShipmentPageRows(db, query),
    readEcotrackCatalog(db),
  ]);
  const buildPageItems = async (rows: typeof pageData.rows) => {
    const productLookup = await getOrderProductLookup(
      db,
      rows.map((row) => row.order),
    );
    return buildListItems(rows, productLookup, catalog);
  };
  const entries = await buildPageItems(pageData.rows);

  if (options.ensureFreshVisiblePage) {
    const staleVisibleIds = entries
      .filter(
        (item) =>
          item.status.isStatusStale || item.status.isTrackingStale || item.status.isMajStale,
      )
      .map((item) => item.orderId);

    if (staleVisibleIds.length > 0) {
      await refreshEcotrackOrderStates(staleVisibleIds, options.actor);
      const refreshedPage = await loadActiveShipmentPageRows(db, query);
      return {
        writable,
        items: await buildPageItems(refreshedPage.rows),
        pagination: refreshedPage.pagination,
      };
    }
  }

  return {
    writable,
    items: entries,
    pagination: pageData.pagination,
  };
}

export async function loadEcotrackOrderDetail(
  orderId: number,
  actor?: ActionActor | null,
): Promise<EcotrackOrderDetail | null> {
  if (!hasDb()) {
    return null;
  }

  const db = getDb();
  const initialRow = await loadShipmentRowByOrderId(db, orderId);
  if (!initialRow) {
    return null;
  }

  try {
    return await ensureFreshShipmentRow(db, initialRow, { actor });
  } catch (error) {
    throw new Error(formatEcotrackActionError('detail', initialRow, error).summary);
  }
}

export async function refreshEcotrackOrder(orderId: number, actor?: ActionActor | null) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  return refreshShipmentRow(db, row, { actor });
}

export async function refreshEcotrackOrdersBatch(
  orderIds: number[],
  actor?: ActionActor | null,
): Promise<EcotrackRefreshBatchResult> {
  const { refreshedOrderIds, ...outcome } = await refreshEcotrackOrderStates(orderIds, actor);
  const db = getDb();
  const rows = await loadShipmentRowsByOrderIds(db, refreshedOrderIds);
  // Read the state we just persisted. Optional MAJ failure must not start a
  // second provider round while assembling the response.
  return { ...outcome, items: await buildEcotrackOrderDetailsFromRows(db, rows) };
}

async function refreshEcotrackOrderStates(orderIds: number[], actor?: ActionActor | null) {
  const db = getDb();
  const rows = await loadShipmentRowsByOrderIds(db, orderIds);
  const refreshedOrderIds: number[] = [];
  const failures: EcotrackRefreshFailure[] = [];

  const batches: ShipmentRow[][] = [];
  for (const provider of ['delivro', 'emir'] as const) {
    const providerRows = rows.filter(
      (row) => (row.provider === 'emir' ? 'emir' : 'delivro') === provider,
    );
    for (let index = 0; index < providerRows.length; index += 100) {
      batches.push(providerRows.slice(index, index + 100));
    }
  }

  for (const batch of batches) {
    const trackingNumbers = batch.map((row) => row.trackingNumber);
    let statusResponse: Awaited<ReturnType<typeof getEcotrackOrdersStatus>>;
    let trackingResponse: Awaited<ReturnType<typeof getEcotrackTrackingsInfoAllowingUnavailable>>;

    try {
      [statusResponse, trackingResponse] = await Promise.all([
        batch[0].provider === 'emir'
          ? getEcotrackOrdersStatus(trackingNumbers, 'all', providerRequestOptions(batch[0]))
          : getEcotrackOrdersStatus(trackingNumbers, 'all'),
        batch[0].provider === 'emir'
          ? getEcotrackTrackingsInfoAllowingUnavailable(
              trackingNumbers,
              providerRequestOptions(batch[0]),
            )
          : getEcotrackTrackingsInfoAllowingUnavailable(trackingNumbers),
      ]);
    } catch (error) {
      failures.push(...batch.map((row) => toEcotrackFailureRecord('refresh', row, error)));
      continue;
    }

    for (const row of batch) {
      try {
        const trackingInfo = trackingResponse.data.get(row.trackingNumber) ?? null;
        const rawTrackingInfo =
          trackingResponse.rawData?.get(row.trackingNumber) ?? trackingInfo ?? null;
        let statusItem = resolveEcotrackStatusEvidence(
          statusResponse.data.get(row.trackingNumber),
          trackingInfo,
        );
        if (
          !statusItem &&
          (trackingResponse.unavailable || shouldRetireShipmentMissingFromStatusFeed(row))
        ) {
          statusItem = await confirmShipmentStatusFromCurrentOrders(row);
          if (!statusItem) {
            await softDeleteShipmentRow(db, row, { actor, operation: 'delete' });
            continue;
          }
        }

        const majResponse = await getEcotrackMaj(
          row.trackingNumber,
          providerRequestOptions(row),
        ).catch(() => null);
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
          actor,
        );
        refreshedOrderIds.push(row.order.id);
      } catch (error) {
        failures.push(toEcotrackFailureRecord('refresh', row, error));
      }
    }
  }

  const successCount = Math.max(0, rows.length - failures.length);

  return {
    ok: successCount > 0 || rows.length === 0,
    refreshedOrderIds,
    failures,
    successCount,
    failureCount: failures.length,
    totalRequested: orderIds.length,
  };
}
