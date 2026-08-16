import { describe, expect, it } from 'vitest';

import { buildOrderTrackingUrl } from './order-tracking-link';

describe('buildOrderTrackingUrl', () => {
  it('builds an opaque localized URL without exposing the sequential order ID', () => {
    expect(buildOrderTrackingUrl(' token with spaces ', 'ar', 'https://shop.example.com/')).toBe(
      'https://shop.example.com/ar/thank-you?token=token%20with%20spaces',
    );
  });

  it('uses French for non-storefront admin locales and rejects missing tokens', () => {
    expect(buildOrderTrackingUrl('secure-token', 'en', 'https://shop.example.com')).toContain(
      '/fr/thank-you?token=',
    );
    expect(buildOrderTrackingUrl(null, 'fr')).toBeNull();
  });
});
