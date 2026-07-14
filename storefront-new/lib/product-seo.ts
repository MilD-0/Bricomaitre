import type { Metadata } from 'next';

import type { StorefrontProductDetailResponse } from '@bric/storefront-core/contracts';

import { locales, type Locale } from '@/i18n/config';
import { isSafeProductImageUrl } from './product-images';
import { getLocalizedProductCopy, parseProductPrice } from './product-presentation';

type Product = StorefrontProductDetailResponse['item'];

const DEFAULT_SITE_URL = 'https://bricomaitre.com';
const SITE_NAME = 'Bricomaitre';

export function getStorefrontSiteUrl(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim() || env.SITE_URL?.trim();
  return (configured || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

export function getProductPath(locale: Locale, token: string) {
  return `/${locale}/products/${encodeURIComponent(token)}`;
}

export function getProductUrl(locale: Locale, token: string) {
  return `${getStorefrontSiteUrl()}${getProductPath(locale, token)}`;
}

function sanitizeDescription(value: string, fallback: string) {
  const normalized = value.replace(/\s+/g, ' ').trim() || fallback;
  return normalized.length <= 160
    ? normalized
    : `${normalized.slice(0, 159).trim()}…`;
}

export function buildProductMetadata(product: Product, locale: Locale): Metadata {
  const copy = getLocalizedProductCopy(product, locale);
  const description = sanitizeDescription(
    copy.description,
    locale === 'ar'
      ? `اطلب ${copy.title} من بريكوماتر مع التوصيل في الجزائر.`
      : `Commandez ${copy.title} chez Bricomaitre avec livraison en Algérie.`,
  );
  const canonical = getProductUrl(locale, product.canonicalToken);
  const images = product.media
    .map((media) => media.url)
    .filter((url) => isSafeProductImageUrl(url));

  return {
    title: copy.title,
    description,
    alternates: {
      canonical,
      languages: {
        ...Object.fromEntries(locales.map((entry) => [entry, getProductUrl(entry, product.canonicalToken)])),
        'x-default': getProductUrl('fr', product.canonicalToken),
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      url: canonical,
      locale: locale === 'ar' ? 'ar_DZ' : 'fr_DZ',
      alternateLocale: locale === 'ar' ? ['fr_DZ'] : ['ar_DZ'],
      title: copy.title,
      description,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.title,
      description,
      images,
    },
  };
}

export function buildMissingProductMetadata(locale: Locale): Metadata {
  const title = locale === 'ar' ? 'المنتج غير موجود' : 'Produit introuvable';
  return {
    title,
    robots: { index: false, follow: true },
  };
}

export function buildProductStructuredData(product: Product, locale: Locale) {
  const copy = getLocalizedProductCopy(product, locale);
  const url = getProductUrl(locale, product.canonicalToken);

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      '@id': `${url}#product`,
      name: copy.title,
      description: copy.description || undefined,
      image: product.media
        .map((media) => media.url)
        .filter((image) => isSafeProductImageUrl(image)),
      sku: product.sku || undefined,
      brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
      category: copy.categoryName || undefined,
      offers: {
        '@type': 'Offer',
        url,
        priceCurrency: 'DZD',
        price: parseProductPrice(product.price).toFixed(2),
        availability: product.availability.inStock
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
        itemCondition: 'https://schema.org/NewCondition',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: locale === 'ar' ? 'الرئيسية' : 'Accueil',
          item: `${getStorefrontSiteUrl()}/${locale}`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: locale === 'ar' ? 'المنتجات' : 'Produits',
          item: `${getStorefrontSiteUrl()}/${locale}/products`,
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: copy.title,
          item: url,
        },
      ],
    },
  ];
}

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
