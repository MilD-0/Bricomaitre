import { getEcotrackMaj, getEcotrackOrdersStatus } from '@bric/storefront-core/ecotrack-client';
import { getDb, hasDb } from '@bric/db/client';

import type { ActionActor } from './action-history';
import { getOrderProductLookup } from './order-records';
import { readEcotrackCatalog } from './ecotrack';
import {
  parseEcotrackShipmentListQuery,
  type EcotrackShipmentListQueryInput,
} from './ecotrack-shipment-list';
import { formatEcotrackActionError, toEcotrackFailureRecord } from './ecotrack-shipment-errors';
import { providerRequestOptions } from './ecotrack-shipment-evidence';
import {
  rawOrderInfoFromTrackingPayload,
  resolveEcotrackStatusEvidence,
} from './ecotrack-shipment-status';
import type { EcotrackShipmentRow as ShipmentRow } from './ecotrack-shipment-types';
import {
  buildEcotrackOrderDetailFromRow,
  buildListItems,
  confirmShipmentStatusFromCurrentOrders,
  ensureFreshShipmentRow,
  getEcotrackTrackingsInfoAllowingMissing,
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
  const stateNameById = new Map(catalog.wilayas.map((entry) => [entry.wilayaId, entry.name]));
  const buildPageItems = async (rows: typeof pageData.rows) => {
    const productLookup = await getOrderProductLookup(
      db,
      rows.map((row) => row.order),
    );
    return buildListItems(rows, productLookup, stateNameById);
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
      await refreshEcotrackOrdersBatch(staleVisibleIds, options.actor);
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

  let freshDetail: EcotrackOrderDetail | null;
  try {
    freshDetail = await ensureFreshShipmentRow(db, initialRow, { actor });
  } catch (error) {
    throw new Error(formatEcotrackActionError('detail', initialRow, error).summary);
  }
  if (!freshDetail) {
    return null;
  }

  const row = await loadShipmentRowByOrderId(db, orderId);
  return row ? buildEcotrackOrderDetailFromRow(db, row) : null;
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
  const db = getDb();
  const rows = (
    await Promise.all(orderIds.map((orderId) => loadShipmentRowByOrderId(db, orderId)))
  ).filter(Boolean) as ShipmentRow[];
  const refreshed: EcotrackOrderDetail[] = [];
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
    let trackingResponse: Awaited<ReturnType<typeof getEcotrackTrackingsInfoAllowingMissing>>;

    try {
      [statusResponse, trackingResponse] = await Promise.all([
        batch[0].provider === 'emir'
          ? getEcotrackOrdersStatus(trackingNumbers, 'all', providerRequestOptions(batch[0]))
          : getEcotrackOrdersStatus(trackingNumbers, 'all'),
        batch[0].provider === 'emir'
          ? getEcotrackTrackingsInfoAllowingMissing(
              trackingNumbers,
              providerRequestOptions(batch[0]),
            )
          : getEcotrackTrackingsInfoAllowingMissing(trackingNumbers),
      ]);
    } catch (error) {
      failures.push(...batch.map((row) => toEcotrackFailureRecord('refresh', row, error)));
      continue;
    }

    for (const row of batch) {
      try {
        if (trackingResponse.missing.has(row.trackingNumber)) {
          await softDeleteShipmentRow(db, row, { actor, operation: 'delete' });
          continue;
        }

        const trackingInfo = trackingResponse.data.get(row.trackingNumber) ?? null;
        const rawTrackingInfo =
          trackingResponse.rawData?.get(row.trackingNumber) ?? trackingInfo ?? null;
        let statusItem = resolveEcotrackStatusEvidence(
          statusResponse.data.get(row.trackingNumber),
          trackingInfo,
        );
        if (!statusItem && shouldRetireShipmentMissingFromStatusFeed(row)) {
          statusItem = await confirmShipmentStatusFromCurrentOrders(row);
          if (!statusItem) {
            await softDeleteShipmentRow(db, row, { actor, operation: 'delete' });
            continue;
          }
        }

        const majResponse = await getEcotrackMaj(row.trackingNumber, providerRequestOptions(row));
        await upsertShipmentState(
          db,
          row,
          {
            statusItem,
            rawStatusItem: statusResponse.rawData?.get(row.trackingNumber) ?? statusItem,
            trackingInfo,
            rawTrackingInfo,
            majEntries: majResponse.data,
            rawMajEntries: majResponse.payload,
            orderInfo: trackingInfo?.OrderInfo ?? null,
            rawOrderInfo: rawOrderInfoFromTrackingPayload(rawTrackingInfo),
          },
          actor,
        );
        const detail = await loadEcotrackOrderDetail(row.order.id);
        if (detail) {
          refreshed.push(detail);
        }
      } catch (error) {
        failures.push(toEcotrackFailureRecord('refresh', row, error));
      }
    }
  }

  const successCount = Math.max(0, rows.length - failures.length);

  return {
    ok: successCount > 0 || rows.length === 0,
    items: refreshed,
    failures,
    successCount,
    failureCount: failures.length,
    totalRequested: orderIds.length,
  };
}
