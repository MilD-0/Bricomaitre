import { describe, expect, it } from 'vitest';

import type { EcotrackCatalogResponse } from './ecotrack-admin-contracts';
import {
  buildOrderPhoneTelHref,
  formatOrderPhoneForDisplay,
  normalizeOrderPhoneForStorage,
  resolveEcotrackDeliveryFee,
} from './order-presentation';

const catalog: EcotrackCatalogResponse = {
  wilayas: [],
  communes: [],
  serviceFees: [
    {
      serviceType: 'livraison',
      wilayaId: 16,
      homeFee: '500.00',
      stopDeskFee: '350.50',
    },
    {
      serviceType: 'retour',
      wilayaId: 16,
      homeFee: '999',
      stopDeskFee: '999',
    },
  ],
  weightFees: [],
  lastSync: null,
};

describe('order presentation helpers', () => {
  it.each([
    [null, ''],
    [undefined, ''],
    ['  ', ''],
    ['0555 12 34 56', '0555 12 34 56'],
    ['555 12 34 56', '0555 12 34 56'],
  ])('formats %s for display', (value, expected) => {
    expect(formatOrderPhoneForDisplay(value)).toBe(expected);
  });

  it('normalizes only a numeric domestic prefix for storage', () => {
    expect(normalizeOrderPhoneForStorage(' 0555123456 ')).toBe('555123456');
    expect(normalizeOrderPhoneForStorage('+213555123456')).toBe('+213555123456');
    expect(normalizeOrderPhoneForStorage('0extension')).toBe('0extension');
  });

  it('builds a whitespace-free telephone link from the display value', () => {
    expect(buildOrderPhoneTelHref('555 12 34 56')).toBe('tel:0555123456');
    expect(buildOrderPhoneTelHref(' ')).toBeNull();
  });

  it('uses the delivery service fee for home and stop-desk orders', () => {
    expect(resolveEcotrackDeliveryFee(catalog, 0, '16', 100)).toBe(500);
    expect(resolveEcotrackDeliveryFee(catalog, 1, '16', 100)).toBe(350.5);
  });

  it('preserves the current fee when the catalog cannot resolve the state', () => {
    expect(resolveEcotrackDeliveryFee(undefined, 0, '16', 625)).toBe(625);
    expect(resolveEcotrackDeliveryFee(catalog, 0, 'not-a-state', 625)).toBe(625);
    expect(resolveEcotrackDeliveryFee(catalog, 0, '31', 625)).toBe(625);
  });
});
