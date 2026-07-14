import type { Metadata } from 'next';
import type { StorefrontProductsResponse } from '@bric/storefront-core/contracts';

import { locales, type Locale } from '@/i18n/config';
import { getStorefrontSiteUrl } from './product-seo';

export function getCatalogUrl(locale: Locale) {
  return `${getStorefrontSiteUrl()}/${locale}/products`;
}

export function buildCatalogMetadata(locale: Locale, filtered: boolean): Metadata {
  const title = locale === 'ar' ? 'كتالوج العدد ومواد البناء' : 'Catalogue outillage et bricolage';
  const description = locale === 'ar'
    ? 'اكتشف منتجات بريكوماتر للعدد والبناء مع التوصيل في جميع أنحاء الجزائر.'
    : 'Découvrez les produits Bricomaitre pour vos travaux, avec livraison partout en Algérie.';
  const canonical = getCatalogUrl(locale);
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        ...Object.fromEntries(locales.map((entry) => [entry, getCatalogUrl(entry)])),
        'x-default': getCatalogUrl('fr'),
      },
    },
    robots: { index: !filtered, follow: true },
    openGraph: {
      type: 'website',
      siteName: 'Bricomaitre',
      url: canonical,
      locale: locale === 'ar' ? 'ar_DZ' : 'fr_DZ',
      title,
      description,
    },
  };
}

export function buildCatalogStructuredData(
  items: StorefrontProductsResponse['items'],
  locale: Locale,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: locale === 'ar' ? 'كتالوج منتجات بريكوماتر' : 'Catalogue produits Bricomaitre',
    itemListElement: items.map((item, index) => {
      const token = item.slug || item.mongoId || String(item.id);
      return {
        '@type': 'ListItem',
        position: index + 1,
        url: `${getCatalogUrl(locale)}/${encodeURIComponent(token)}`,
        name: locale === 'ar' && item.titleAr?.trim() ? item.titleAr.trim() : item.title,
      };
    }),
  };
}
