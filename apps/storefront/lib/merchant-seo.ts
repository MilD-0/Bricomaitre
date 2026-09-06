import type { Locale } from '@/i18n/config';
import { getStorefrontSiteUrl } from './site-url';

export const STOREFRONT_MERCHANT = {
  name: 'Bricomaitre',
  countryCode: 'DZ',
  currency: 'DZD',
  averageShippingCost: 800,
} as const;

const copy = {
  fr: {
    returnPolicy: 'Retour gratuit avant ouverture du colis.',
    shipping: 'Livraison dans toute l’Algérie, environ 800 DA en moyenne.',
  },
  ar: {
    returnPolicy: 'الإرجاع مجاني قبل فتح الطرد.',
    shipping: 'التوصيل إلى جميع أنحاء الجزائر، بمتوسط يقارب 800 دج.',
  },
} as const;

export function buildMerchantReturnPolicy(locale: Locale) {
  const siteUrl = getStorefrontSiteUrl();
  return {
    '@type': 'MerchantReturnPolicy',
    '@id': `${siteUrl}/#return-policy`,
    applicableCountry: STOREFRONT_MERCHANT.countryCode,
    returnPolicyCountry: STOREFRONT_MERCHANT.countryCode,
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 0,
    returnFees: 'https://schema.org/FreeReturn',
    description: copy[locale].returnPolicy,
  };
}

export function buildOfferShippingDetails(locale: Locale) {
  return {
    '@type': 'OfferShippingDetails',
    shippingDestination: {
      '@type': 'DefinedRegion',
      addressCountry: STOREFRONT_MERCHANT.countryCode,
    },
    shippingRate: {
      '@type': 'MonetaryAmount',
      currency: STOREFRONT_MERCHANT.currency,
      value: STOREFRONT_MERCHANT.averageShippingCost,
    },
    description: copy[locale].shipping,
  };
}
