import { describe, expect, it } from 'vitest';

import { DEFAULT_STOREFRONT_SETTINGS, storefrontSettingsInputSchema } from './settings';

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
