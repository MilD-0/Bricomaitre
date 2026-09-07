import { type EcotrackCatalogRecord } from '@bric/storefront-core/ecotrack-support';
import { parseNumericAmount, type DeliveryType } from '../orders';
import { type EcotrackFeeLookup, type EcotrackServiceType } from './contract';

export function resolveEcotrackCommune(
  catalog: EcotrackCatalogRecord,
  state: number | null,
  city: string | null,
) {
  if (state === null) {
    return null;
  }

  const rawCity = city?.trim() ?? '';
  if (!rawCity) {
    return null;
  }

  return catalog.communes.find(
    (entry) =>
      entry.wilayaId === state &&
      (String(entry.communeId) === rawCity || entry.name.toLowerCase() === rawCity.toLowerCase()),
  );
}

export function resolveEcotrackDeliveryFee(
  catalog: EcotrackFeeLookup,
  wilayaId: number | null | undefined,
  deliveryType: DeliveryType,
  serviceType: EcotrackServiceType = 'livraison',
) {
  if (!wilayaId) {
    return 0;
  }

  const serviceFee = catalog.serviceFees.find(
    (entry) => entry.serviceType === serviceType && entry.wilayaId === wilayaId,
  );

  if (!serviceFee) {
    return 0;
  }

  return deliveryType === 0
    ? parseNumericAmount(serviceFee.homeFee)
    : parseNumericAmount(serviceFee.stopDeskFee);
}
