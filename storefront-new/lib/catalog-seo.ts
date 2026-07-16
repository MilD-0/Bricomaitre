import type { Metadata } from 'next';
import type { StorefrontProductsResponse } from '@bric/storefront-core/contracts';

import { locales, type Locale } from '@/i18n/config';
import { getStorefrontSiteUrl } from './site-url';

type TaxonomyMetadataInput = {
  locale: Locale;
  kind: 'category' | 'brand';
  name: string;
  nameAr?: string | null;
  slug: string;
  filtered?: boolean;
};

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
      alternateLocale: locale === 'ar' ? ['fr_DZ'] : ['ar_DZ'],
      title,
      description,
      images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Bricomaitre' }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: ['/icons/icon-512.png'],
    },
  };
}

export function buildTaxonomyCatalogMetadata({ locale, kind, name, nameAr, slug, filtered = false }: TaxonomyMetadataInput): Metadata {
  const { title: localizedName, description } = buildTaxonomyCatalogCopy({ locale, kind, name, nameAr });
  const path = `/${kind === 'category' ? 'categories' : 'brands'}/${encodeURIComponent(slug)}`;
  const canonical = `${getStorefrontSiteUrl()}/${locale}${path}`;
  const title = locale === 'ar'
    ? `${localizedName} | بريكوماتر`
    : `${localizedName} | Bricomaitre`;

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        ...Object.fromEntries(locales.map((entry) => [entry, `${getStorefrontSiteUrl()}/${entry}${path}`])),
        'x-default': `${getStorefrontSiteUrl()}/fr${path}`,
      },
    },
    robots: { index: !filtered, follow: true },
    openGraph: {
      type: 'website',
      siteName: 'Bricomaitre',
      url: canonical,
      locale: locale === 'ar' ? 'ar_DZ' : 'fr_DZ',
      alternateLocale: locale === 'ar' ? ['fr_DZ'] : ['ar_DZ'],
      title,
      description,
      images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Bricomaitre' }],
    },
    twitter: { card: 'summary', title, description, images: ['/icons/icon-512.png'] },
  };
}

export function buildTaxonomyCatalogCopy({ locale, kind, name, nameAr }: Omit<TaxonomyMetadataInput, 'slug' | 'filtered'>) {
  const title = locale === 'ar' && nameAr?.trim() ? nameAr.trim() : name;
  const isCategory = kind === 'category';
  const description = locale === 'ar'
    ? `${isCategory ? 'تسوّق منتجات' : 'اكتشف منتجات'} ${title} لدى بريكوماتر مع التوصيل في جميع أنحاء الجزائر.`
    : `${isCategory ? 'Découvrez les produits de la catégorie' : 'Découvrez les produits'} ${title} chez Bricomaitre, avec livraison partout en Algérie.`;
  return { title, description };
}

export function buildTaxonomyUnavailableMetadata(locale: Locale): Metadata {
  return {
    title: locale === 'ar' ? 'الكتالوج غير متاح مؤقتًا' : 'Catalogue momentanément indisponible',
    robots: { index: false, follow: true },
  };
}

export function buildCatalogStructuredData(
  items: StorefrontProductsResponse['items'],
  locale: Locale,
  name?: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: name ?? (locale === 'ar' ? 'كتالوج منتجات بريكوماتر' : 'Catalogue produits Bricomaitre'),
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
