import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STOREFRONT_SETTINGS,
  storefrontSettingsInputSchema,
  formatAlgerianPhoneNumber,
  normalizeAlgerianPhoneNumber,
  toStorefrontContactSettings,
} from './settings';

describe('storefront settings contract', () => {
  it('accepts ordinary contact emails and rejects malformed addresses', () => {
    expect(
      storefrontSettingsInputSchema.safeParse({
        ...DEFAULT_STOREFRONT_SETTINGS,
        contactEmail: ' support@example.com ',
      }).success,
    ).toBe(true);
    expect(
      storefrontSettingsInputSchema.safeParse({
        ...DEFAULT_STOREFRONT_SETTINGS,
        contactEmail: 'not-an-email',
      }).success,
    ).toBe(false);
  });
});

describe('storefront contact settings', () => {
  it('accepts national and international Algerian phone formats', () => {
    expect(normalizeAlgerianPhoneNumber('0795 34 28 26')).toBe('0795342826');
    expect(normalizeAlgerianPhoneNumber('+213 795 34 28 26')).toBe('0795342826');
    expect(formatAlgerianPhoneNumber('0795342826')).toBe('0795 34 28 26');
  });

  it('rejects invalid phone numbers', () => {
    expect(
      storefrontSettingsInputSchema.safeParse({
        contactPhone: '123',
        phoneEnabled: false,
      }).success,
    ).toBe(false);
  });

  it('builds a direct call destination', () => {
    expect(
      toStorefrontContactSettings({
        contactPhone: '0795342826',
        phoneEnabled: false,
        aiAssistantEnabled: false,
      }),
    ).toMatchObject({
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
      aiAssistantEnabled: false,
    });
  });
});
