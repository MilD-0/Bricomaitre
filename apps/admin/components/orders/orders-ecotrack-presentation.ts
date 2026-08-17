import type { EcotrackBulkActionFailure } from '../../lib/ecotrack-admin-contracts';

const TRACKING_HISTORY_STATUSES = new Set([
  'order_information_received_by_carrier',
  'picked',
  'accepted_by_carrier',
  'dispatched_to_driver',
  'attempt_delivery',
  'return_asked',
  'return_in_transit',
  'return_received',
  'livred',
  'encaissed',
  'payed',
]);

export function buildEcotrackFailureSummary(failures: EcotrackBulkActionFailure[], limit = 2) {
  return failures
    .slice(0, limit)
    .map((failure) => failure.message)
    .join(' ');
}

export function formatEcotrackDateTime(locale: string, value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatEcotrackMoney(locale: string, value: number | null | undefined) {
  if (value == null) {
    return '0.00';
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatEcotrackAmountInput(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return '';
  }

  return Number(value).toFixed(2);
}

export function getEcotrackDeliveryLabelKey(value: 0 | 1) {
  return value === 1 ? 'ordersManager.delivery.office' : 'ordersManager.delivery.home';
}

export function getTrackingHistoryStatusKey(status: string) {
  const normalized = status.trim().toLowerCase();
  return TRACKING_HISTORY_STATUSES.has(normalized)
    ? `ordersEcotrackManager.historyStatuses.${normalized}`
    : null;
}
