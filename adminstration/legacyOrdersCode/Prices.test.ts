import { describe, expect, it, vi } from 'vitest';

import { calculateDeliveryPrice, calculateDeliveryPrice2, getCodeFromState } from './Prices.js';

describe('legacyOrdersCode/Prices', () => {
  it('calculates delivery price from a numeric wilaya code', () => {
    const order = {
      state: 16,
      delivery: 'home',
      cartProducts: ['product-1'],
    };

    expect(calculateDeliveryPrice(order)).toBe(400);
    expect(order.del_pr).toBe(400);
  });

  it('calculates delivery price from a numeric wilaya code stored as text', () => {
    const order = {
      state: '31',
      delivery: 'office',
      cartProducts: ['product-1'],
    };

    expect(calculateDeliveryPrice2(order)).toBe(400);
    expect(order.del_pr).toBe(400);
  });

  it('keeps string wilaya names working during the migration', () => {
    expect(getCodeFromState('Alger')).toBe(16);
    expect(getCodeFromState('Tebessa')).toBe(12);
  });

  it('returns null and logs when the wilaya code is unknown', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const order = {
      state: 999,
      delivery: 'home',
      cartProducts: ['product-1'],
    };

    expect(calculateDeliveryPrice(order)).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith('State "999" not found in delivery prices');

    errorSpy.mockRestore();
  });

  it('returns free shipping for the dedicated free-shipping product', () => {
    const order = {
      state: 16,
      delivery: 'office',
      cartProducts: ['f00000000000000000000005'],
    };

    expect(calculateDeliveryPrice(order)).toBe(0);
    expect(order.del_pr).toBe(0);
  });
});
