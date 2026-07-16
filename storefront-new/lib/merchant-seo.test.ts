import { describe, expect, it } from 'vitest';

import {
  buildMerchantReturnPolicy,
  buildOfferShippingDetails,
  getMerchantPolicyCopy,
  STOREFRONT_MERCHANT,
} from './merchant-seo';

describe('storefront merchant SEO constants', () => {
  it('publishes the approved seller and Algeria-wide average shipping facts', () => {
    expect(STOREFRONT_MERCHANT).toEqual({
      name: 'Bricomaitre',
      countryCode: 'DZ',
      currency: 'DZD',
      averageShippingCost: 800,
    });
    expect(buildOfferShippingDetails('fr')).toMatchObject({
      '@type': 'OfferShippingDetails',
      shippingDestination: { addressCountry: 'DZ' },
      shippingRate: { currency: 'DZD', value: 800 },
    });
  });

  it('keeps the unopened-package return condition localized and free', () => {
    expect(buildMerchantReturnPolicy('ar')).toMatchObject({
      applicableCountry: 'DZ',
      merchantReturnDays: 0,
      returnFees: 'https://schema.org/FreeReturn',
      description: 'الإرجاع مجاني قبل فتح الطرد.',
    });
    expect(getMerchantPolicyCopy('fr').returnPolicy).toContain('avant ouverture');
  });
});
