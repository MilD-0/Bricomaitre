import { afterEach, describe, expect, it } from 'vitest';

import { buildDraftPromoHref, buildStorefrontProductHref } from './storefront-links';

const originalStorefrontBaseUrl = process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL;

afterEach(() => {
  if (originalStorefrontBaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL;
  } else {
    process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL = originalStorefrontBaseUrl;
  }
});

describe('product storefront links', () => {
  it('uses a product slug when available and falls back to its numeric id', () => {
    expect(buildStorefrontProductHref({ id: 41, slug: 'impact-drill' })).toBe(
      'https://bricomaitre.com/products/impact-drill',
    );
    expect(buildStorefrontProductHref({ id: 41, slug: null })).toBe(
      'https://bricomaitre.com/products/41',
    );
  });

  it('normalizes the configured base URL and encodes promo parameters', () => {
    process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL = 'https://shop.example.com/';

    expect(buildDraftPromoHref({ slug: 'cordless drill' }, 'SAVE & GO')).toBe(
      'https://shop.example.com/products/cordless%20drill?promo=SAVE+%26+GO',
    );
  });

  it('derives a stable draft slug when the product has not been saved', () => {
    expect(buildDraftPromoHref({ title: '  Nova Drill 18V  ' }, 'NOVA')).toBe(
      'https://bricomaitre.com/products/nova-drill-18v?promo=NOVA',
    );
  });
});
