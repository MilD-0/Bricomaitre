import type { EcotrackCatalogResponse } from './ecotrack-admin-contracts';
import { parseNumericAmount } from './orders';

export function formatOrderPhoneForDisplay(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('0') ? trimmed : `0${trimmed}`;
}

export function normalizeOrderPhoneForStorage(value: string) {
  const trimmed = value.trim();

  if (/^0\d+$/.test(trimmed)) {
    return trimmed.slice(1);
  }

  return trimmed;
}

export function buildOrderPhoneTelHref(value: string | null | undefined) {
  const displayValue = formatOrderPhoneForDisplay(value);

  return displayValue ? `tel:${displayValue.replace(/\s+/g, '')}` : null;
}

export function resolveEcotrackDeliveryFee(
  catalog: EcotrackCatalogResponse | undefined,
  delivery: 0 | 1,
  stateValue: string,
  fallback: number,
) {
  if (!catalog) {
    return fallback;
  }

  const wilayaId = Number.parseInt(stateValue, 10);
  if (!Number.isInteger(wilayaId)) {
    return fallback;
  }

  const serviceFee = catalog.serviceFees.find(
    (entry) => entry.serviceType === 'livraison' && entry.wilayaId === wilayaId,
  );

  if (!serviceFee) {
    return fallback;
  }

  return parseNumericAmount(delivery === 0 ? serviceFee.homeFee : serviceFee.stopDeskFee);
}
