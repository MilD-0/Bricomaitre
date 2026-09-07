import type { EcotrackCatalogResponse } from './ecotrack-admin-contracts';
import { parseNumericAmount } from './orders';

export function formatOrderPhoneForDisplay(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';

  if (!trimmed) {
    return '';
  }

  // Older local numbers omit the domestic prefix. International notation and
  // free-form legacy text already have meaning; do not invent a prefix for them.
  return /^[567][\d\s-]*$/.test(trimmed) && trimmed.replace(/\D/g, '').length === 9
    ? `0${trimmed}`
    : trimmed;
}

export function normalizeOrderPhoneForStorage(value: string) {
  const trimmed = value.trim();

  if (/^0\d+$/.test(trimmed)) {
    return trimmed.slice(1);
  }

  return trimmed;
}

export function splitOrderFullNameDraft(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  const [firstName, ...rest] = normalized.split(' ');
  return {
    firstName,
    lastName: rest.length > 0 ? rest.join(' ') : null,
  };
}

export function formatOrderStateValue(state: number | null) {
  return state === null ? '' : String(state);
}

export function parseOrderStateDraftValue(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeOrderCommuneValue(
  state: number | null,
  city: string | null,
  catalog?: EcotrackCatalogResponse,
) {
  const rawCity = (city ?? '').trim();

  if (!catalog || !rawCity || state === null) {
    return rawCity;
  }

  const byId = catalog.communes.find(
    (entry) => String(entry.communeId) === rawCity && entry.wilayaId === state,
  );
  if (byId) {
    return String(byId.communeId);
  }

  const byName = catalog.communes.find(
    (entry) => entry.wilayaId === state && entry.name.toLowerCase() === rawCity.toLowerCase(),
  );
  return byName ? String(byName.communeId) : rawCity;
}

export function formatOrderRegionLabel(
  catalog: EcotrackCatalogResponse | undefined,
  state: number | string | null,
  city: string | null,
  placeholder: string,
) {
  const rawState = typeof state === 'number' ? String(state) : (state ?? '').trim();
  const rawCity = (city ?? '').trim();
  const wilayaId = Number.parseInt(rawState, 10);
  const wilayaName =
    catalog && Number.isInteger(wilayaId)
      ? catalog.wilayas.find((entry) => entry.wilayaId === wilayaId)?.name
      : undefined;
  const communeName =
    catalog && Number.isInteger(wilayaId) && rawCity
      ? (
          catalog.communes.find(
            (entry) => entry.wilayaId === wilayaId && String(entry.communeId) === rawCity,
          ) ??
          catalog.communes.find(
            (entry) =>
              entry.wilayaId === wilayaId && entry.name.toLowerCase() === rawCity.toLowerCase(),
          )
        )?.name
      : undefined;

  return (
    [wilayaName ?? rawState, communeName ?? rawCity].filter(Boolean).join(' / ') || placeholder
  );
}

export function resolveOrderCommuneForState(
  catalog: EcotrackCatalogResponse | undefined,
  stateValue: string,
  cityValue: string,
) {
  const wilayaId = Number.parseInt(stateValue, 10);
  if (!catalog || !Number.isInteger(wilayaId)) {
    return cityValue;
  }

  const communeOptions = catalog.communes.filter((entry) => entry.wilayaId === wilayaId);
  if (communeOptions.length === 0) {
    return '';
  }

  const rawCity = cityValue.trim();
  const currentCommune =
    communeOptions.find((entry) => String(entry.communeId) === rawCity) ??
    communeOptions.find((entry) => entry.name.toLowerCase() === rawCity.toLowerCase());

  return currentCommune ? String(currentCommune.communeId) : String(communeOptions[0].communeId);
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
