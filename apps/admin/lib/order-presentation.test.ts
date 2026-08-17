import { describe, expect, it } from 'vitest';

import type { EcotrackCatalogResponse } from './ecotrack-admin-contracts';
import {
  buildOrderPhoneTelHref,
  formatOrderProductLabel,
  formatOrderRegionLabel,
  formatOrderPhoneForDisplay,
  formatOrderStateValue,
  getOrderProductHoverKey,
  normalizeOrderCommuneValue,
  normalizeOrderPhoneForStorage,
  parseOrderStateDraftValue,
  resolveEcotrackDeliveryFee,
  resolveOrderCommuneForState,
  splitOrderFullNameDraft,
} from './order-presentation';

const catalog: EcotrackCatalogResponse = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }],
  communes: [
    {
      communeId: 1601,
      wilayaId: 16,
      name: 'Alger Centre',
      postalCode: '16000',
      hasStopDesk: true,
    },
    {
      communeId: 1602,
      wilayaId: 16,
      name: 'Bab El Oued',
      postalCode: '16008',
      hasStopDesk: false,
    },
  ],
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

  it('splits normalized order names without inventing a surname', () => {
    expect(splitOrderFullNameDraft('  Amina   Ben Salah ')).toEqual({
      firstName: 'Amina',
      lastName: 'Ben Salah',
    });
    expect(splitOrderFullNameDraft('Amina')).toEqual({ firstName: 'Amina', lastName: null });
    expect(splitOrderFullNameDraft('  ')).toEqual({ firstName: null, lastName: null });
  });

  it('builds stable hover keys for canonical and legacy product references', () => {
    expect(
      getOrderProductHoverKey(42, {
        rawValue: 'legacy-product',
        productId: 7,
        slug: 'hammer',
        title: 'Hammer',
        thumbnailUrl: null,
        quantity: 1,
        unitPrice: 100,
        lineTotal: 100,
        missing: false,
      }),
    ).toBe('42:7');
    expect(
      getOrderProductHoverKey(42, {
        rawValue: 'legacy-product',
        productId: null,
        slug: null,
        title: 'Legacy product',
        thumbnailUrl: null,
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
        missing: true,
      }),
    ).toBe('42:legacy-product');
  });

  it('formats order product summaries without presenting prices for missing products', () => {
    const formatMoney = (value: number) => `${value} DZD`;
    const product = {
      rawValue: '7',
      productId: 7,
      slug: 'hammer',
      title: 'Hammer',
      thumbnailUrl: null,
      quantity: 2,
      unitPrice: 100,
      lineTotal: 200,
      missing: false,
    };

    expect(formatOrderProductLabel(product, formatMoney)).toBe('Hammer x2 · 200 DZD');
    expect(formatOrderProductLabel({ ...product, quantity: 1, lineTotal: 100 }, formatMoney)).toBe(
      'Hammer · 100 DZD',
    );
    expect(formatOrderProductLabel({ ...product, missing: true }, formatMoney)).toBe('Hammer x2');
  });

  it('round-trips valid order state draft values and rejects empty or invalid values', () => {
    expect(formatOrderStateValue(null)).toBe('');
    expect(formatOrderStateValue(16)).toBe('16');
    expect(parseOrderStateDraftValue(' 16 ')).toBe(16);
    expect(parseOrderStateDraftValue('')).toBeNull();
    expect(parseOrderStateDraftValue('Alger')).toBeNull();
  });

  it('normalizes commune names and identifiers against the selected wilaya', () => {
    expect(normalizeOrderCommuneValue(16, '1601', catalog)).toBe('1601');
    expect(normalizeOrderCommuneValue(16, 'alger centre', catalog)).toBe('1601');
    expect(normalizeOrderCommuneValue(31, 'Alger Centre', catalog)).toBe('Alger Centre');
    expect(normalizeOrderCommuneValue(null, '  Oran  ', catalog)).toBe('Oran');
  });

  it('formats canonical and legacy order regions without hiding unresolved values', () => {
    expect(formatOrderRegionLabel(catalog, 16, '1601', 'Unknown')).toBe('Alger / Alger Centre');
    expect(formatOrderRegionLabel(catalog, '16', 'bab el oued', 'Unknown')).toBe(
      'Alger / Bab El Oued',
    );
    expect(formatOrderRegionLabel(catalog, '31', 'Oran', 'Unknown')).toBe('31 / Oran');
    expect(formatOrderRegionLabel(catalog, null, null, 'Unknown')).toBe('Unknown');
  });

  it('keeps a selected commune when switching within a catalog or chooses the first fallback', () => {
    expect(resolveOrderCommuneForState(catalog, '16', '1602')).toBe('1602');
    expect(resolveOrderCommuneForState(catalog, '16', 'alger centre')).toBe('1601');
    expect(resolveOrderCommuneForState(catalog, '16', 'Unknown')).toBe('1601');
    expect(resolveOrderCommuneForState(catalog, '31', 'Oran')).toBe('');
    expect(resolveOrderCommuneForState(undefined, '16', 'Alger Centre')).toBe('Alger Centre');
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
