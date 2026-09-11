import { describe, expect, it } from 'vitest';

import { buildStorefrontOrderDuplicateFingerprint } from './order-duplicates';

const base = {
  phoneNumber1: '0550 12 34 56',
  cartProducts: ['12', '4', '12'],
  delivery: 0,
  state: 16,
  city: ' Alger  Centre ',
  homeAddress: ' 12 Rue  Didouche ',
  totalAmount: '1250.00',
};

describe('storefront order duplicate fingerprint', () => {
  it('normalizes order-independent cart and customer formatting', () => {
    expect(buildStorefrontOrderDuplicateFingerprint(base)).toBe(
      buildStorefrontOrderDuplicateFingerprint({
        ...base,
        phoneNumber1: '+213550123456',
        cartProducts: ['12', '12', '4'],
        city: 'alger centre',
        homeAddress: '12 rue didouche',
        totalAmount: 1250,
      }),
    );
  });

  it('keeps distinct business intents distinct', () => {
    const fingerprint = buildStorefrontOrderDuplicateFingerprint(base);
    expect(
      buildStorefrontOrderDuplicateFingerprint({ ...base, homeAddress: '13 Rue Didouche' }),
    ).not.toBe(fingerprint);
    expect(
      buildStorefrontOrderDuplicateFingerprint({ ...base, cartProducts: ['12', '4'] }),
    ).not.toBe(fingerprint);
    expect(buildStorefrontOrderDuplicateFingerprint({ ...base, totalAmount: '1300.00' })).not.toBe(
      fingerprint,
    );
  });

  it('ignores home address for stop-desk delivery and declines weak identities', () => {
    expect(
      buildStorefrontOrderDuplicateFingerprint({ ...base, delivery: 1, homeAddress: null }),
    ).toBe(
      buildStorefrontOrderDuplicateFingerprint({
        ...base,
        delivery: 1,
        homeAddress: 'unused address',
      }),
    );
    expect(
      buildStorefrontOrderDuplicateFingerprint({ ...base, phoneNumber1: 'invalid' }),
    ).toBeNull();
    expect(buildStorefrontOrderDuplicateFingerprint({ ...base, cartProducts: [] })).toBeNull();
  });
});
