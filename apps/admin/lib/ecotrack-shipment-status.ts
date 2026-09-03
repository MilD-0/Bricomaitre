import type {
  EcotrackMajEntry as UpstreamEcotrackMajEntry,
  EcotrackOrderInfo,
  EcotrackOrderSummary,
  EcotrackStatusItem,
  EcotrackTrackingInfo,
} from '@bric/storefront-core/ecotrack-client';
import { readEcotrackActivityTimestamp } from '@bric/storefront-core/ecotrack-tracking';

import { ECOTRACK_FAILED_STATUS_MAX_AGE_MS } from './ecotrack-status-policy';
import { normalizeEcotrackMonetaryValue } from './ecotrack-monetary';
import { findLatestDate } from './ecotrack-shipment-errors';
import type { EcotrackShipmentRow } from './ecotrack-shipment-types';
import type { OrderStatus } from './orders';

const ECOTRACK_DISPATCHED_STATUSES = new Set([
  'en_ramassage',
  'en_preparation_stock',
  'en_preparation',
]);
const ECOTRACK_IN_DELIVERY_STATUSES = new Set([
  'en_livraison',
  'en_hub',
  'vers_wilaya',
  'vers_hub',
]);
const ECOTRACK_COMPLETED_STATUSES = new Set([
  'livre_non_encaisse',
  'encaisse_non_paye',
  'paiements_prets',
  'payed',
  'paye_et_archive',
]);
const ECOTRACK_RETURNED_STATUSES = new Set([
  'retour_chez_livreur',
  'retour_transit_entrepot',
  'retour_en_traitement',
  'retour_recu',
  'retour_archive',
]);
export function sanitizeNullableText(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}
export function getUpstreamTrackingValues(item: EcotrackStatusItem) {
  return {
    currentStatus: item.status,
    driverPhone: sanitizeNullableText(item.driver_phone),
    estimatedFee: normalizeEcotrackMonetaryValue(item.estimated_fee),
    deskPhone: sanitizeNullableText(item.desk_phone),
    deskCommune: sanitizeNullableText(item.desk_commune),
    deskMapLink: sanitizeNullableText(item.desk_map_link),
    deskAddress: sanitizeNullableText(item.desk_address),
  };
}

function nullableProviderAmount(value: string | number | null | undefined) {
  return normalizeEcotrackMonetaryValue(value);
}

export function parseEcotrackProviderTimestamp(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const isoLike = value.includes('T') ? value.trim() : value.trim().replace(' ', 'T');
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(isoLike) ? isoLike : `${isoLike}+01:00`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function providerBoolean(value: boolean | string | number | null | undefined) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (['0', 'false', 'no'].includes(normalized)) return false;
  return null;
}

export function mapEcotrackOrderSnapshot(item: EcotrackOrderInfo | EcotrackOrderSummary) {
  const currentAmount = nullableProviderAmount(item.montant);
  return {
    currentAmount,
    currentAmountSource: currentAmount === null ? null : 'ecotrack_orders',
    deliveryTariff: nullableProviderAmount(item.tarif_prestation),
    returnTariff: nullableProviderAmount(item.tarif_retour),
    stopDesk: providerBoolean(item.stop_desk),
    paymentId:
      item.payment_id === null || item.payment_id === undefined
        ? null
        : sanitizeNullableText(String(item.payment_id)),
    statusReason: sanitizeNullableText(item.status_reason),
    providerCreatedAt: parseEcotrackProviderTimestamp(item.created_at),
    providerUpdatedAt: parseEcotrackProviderTimestamp(item.last_updated_at),
  };
}

export function rawOrderInfoFromTrackingPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const orderInfo = (payload as Record<string, unknown>).OrderInfo;
  return orderInfo && typeof orderInfo === 'object' ? orderInfo : null;
}

function statusItemFromTrackingInfo(info: EcotrackTrackingInfo | null | undefined) {
  const status = info?.status?.trim();
  return status ? ({ status, activity: [] } satisfies EcotrackStatusItem) : null;
}

export function resolveEcotrackStatusEvidence(
  statusItem: EcotrackStatusItem | null | undefined,
  trackingInfo: EcotrackTrackingInfo | null | undefined,
) {
  return statusItem ?? statusItemFromTrackingInfo(trackingInfo);
}

export function deriveLatestUpstreamActivityAt(
  row: EcotrackShipmentRow,
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
) {
  const latestActivity = findLatestDate([
    ...(payload.statusItem?.activity ?? []).map((entry) => readEcotrackActivityTimestamp(entry)),
    ...(payload.trackingInfo?.activity ?? []).map((entry) => readEcotrackActivityTimestamp(entry)),
    ...(payload.majEntries ?? []).map((entry) => readEcotrackActivityTimestamp(entry)),
  ]);

  return latestActivity ?? row.order.ecotrackStatusLastUpdate ?? row.createdAt;
}

export function mapEcotrackStatusToOrderStatus(
  currentStatus: string,
  latestUpstreamActivityAt: Date | null,
): OrderStatus | null {
  const normalized = currentStatus.trim().toLowerCase();

  if (ECOTRACK_DISPATCHED_STATUSES.has(normalized)) {
    return 3;
  }

  if (ECOTRACK_IN_DELIVERY_STATUSES.has(normalized)) {
    return 7;
  }

  if (normalized === 'suspendu') {
    return 5;
  }

  if (normalized === 'annule') {
    return 6;
  }

  if (ECOTRACK_COMPLETED_STATUSES.has(normalized)) {
    return 4;
  }

  if (ECOTRACK_RETURNED_STATUSES.has(normalized)) {
    return 8;
  }

  if (
    latestUpstreamActivityAt &&
    Date.now() - latestUpstreamActivityAt.getTime() >= ECOTRACK_FAILED_STATUS_MAX_AGE_MS
  ) {
    return 9;
  }

  return null;
}
