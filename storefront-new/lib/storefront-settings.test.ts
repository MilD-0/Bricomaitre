import { describe, expect, it } from 'vitest';

import {
  formatAlgerianPhoneNumber,
  normalizeAlgerianPhoneNumber,
  storefrontSettingsInputSchema,
  toStorefrontContactSettings,
} from '@bric/storefront-core/settings';

describe('storefront contact settings', () => {
  it('accepts national and international Algerian phone formats', () => {
    expect(normalizeAlgerianPhoneNumber('0795 34 28 26')).toBe('0795342826');
    expect(normalizeAlgerianPhoneNumber('+213 795 34 28 26')).toBe('0795342826');
    expect(formatAlgerianPhoneNumber('0795342826')).toBe('0795 34 28 26');
  });

  it('rejects invalid phone numbers', () => {
    expect(storefrontSettingsInputSchema.safeParse({
      contactPhone: '123',
      phoneEnabled: true,
    }).success).toBe(false);
  });

  it('builds a direct call destination', () => {
    expect(toStorefrontContactSettings({
      contactPhone: '0795342826',
      phoneEnabled: false,
    })).toEqual({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: false,
    });
  });
});
