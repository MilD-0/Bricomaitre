import type { Metadata } from 'next';

import type { StorefrontLandingPageResponse } from '@bric/storefront-core/landing-pages';

import type { Locale } from '@/i18n/config';
import { isSafeProductImageUrl } from '@/lib/product-images';
import { getStorefrontSiteUrl } from '@/lib/site-url';

const SITE_NAME = 'Bricomaitre';

function getLandingPageUrl(locale: Locale, slug: string) {
  return `${getStorefrontSiteUrl()}/${locale}/landing/${encodeURIComponent(slug)}`;
}

export function buildLandingPageMetadata(
  page: StorefrontLandingPageResponse,
  locale: Locale,
  hasAlternateLocale: boolean,
): Metadata {
  const alternateLocale: Locale = locale === 'fr' ? 'ar' : 'fr';
  const canonical = getLandingPageUrl(locale, page.slug);
  const hero = page.document.blocks.find((block) => block.type === 'product-hero');
  const imageUrl = [hero?.imageUrl, ...page.product.media.map((media) => media.url)].find(
    (url): url is string => Boolean(url && isSafeProductImageUrl(url)),
  );
  const imageAlt =
    hero?.imageAlt ||
    (locale === 'ar' && page.product.titleAr ? page.product.titleAr : page.product.title);
  const images = imageUrl ? [{ url: imageUrl, alt: imageAlt }] : undefined;
  const alternates: Metadata['alternates'] = { canonical };

  if (hasAlternateLocale) {
    alternates.languages = {
      fr: getLandingPageUrl('fr', page.slug),
      ar: getLandingPageUrl('ar', page.slug),
      'x-default': getLandingPageUrl('fr', page.slug),
    };
  }

  return {
    title: page.document.seo.title,
    description: page.document.seo.description,
    alternates,
    robots: { index: page.document.seo.indexable, follow: page.document.seo.indexable },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: page.document.seo.title,
      description: page.document.seo.description,
      url: canonical,
      locale: locale === 'ar' ? 'ar_DZ' : 'fr_DZ',
      alternateLocale: hasAlternateLocale
        ? [alternateLocale === 'ar' ? 'ar_DZ' : 'fr_DZ']
        : undefined,
      images,
    },
    twitter: {
      card: imageUrl ? 'summary_large_image' : 'summary',
      title: page.document.seo.title,
      description: page.document.seo.description,
      images,
    },
  };
}
