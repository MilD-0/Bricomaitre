import type { Metadata } from 'next';

import { locales, type Locale } from '@/i18n/config';
import { buildMerchantReturnPolicy, STOREFRONT_MERCHANT } from './merchant-seo';
import { getStorefrontSiteUrl } from './site-url';

const copy = {
  fr: {
    title: 'Outillage, bricolage et matériel professionnel',
    description: 'Trouvez vos outils et votre matériel de bricolage chez Bricomaitre, avec livraison partout en Algérie.',
  },
  ar: {
    title: 'أدوات ومعدات الأشغال والبناء',
    description: 'اكتشف أدوات ومعدات بريكوماتر مع التوصيل إلى جميع أنحاء الجزائر.',
  },
} as const;

export function getHomepageUrl(locale: Locale) {
  return `${getStorefrontSiteUrl()}/${locale}`;
}

export function buildHomepageMetadata(locale: Locale): Metadata {
  const localized = copy[locale];
  const canonical = getHomepageUrl(locale);

  return {
    title: localized.title,
    description: localized.description,
    alternates: {
      canonical,
      languages: {
        ...Object.fromEntries(locales.map((entry) => [entry, getHomepageUrl(entry)])),
        'x-default': getHomepageUrl('fr'),
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      siteName: 'Bricomaitre',
      url: canonical,
      locale: locale === 'ar' ? 'ar_DZ' : 'fr_DZ',
      alternateLocale: locale === 'ar' ? ['fr_DZ'] : ['ar_DZ'],
      title: localized.title,
      description: localized.description,
      images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'Bricomaitre' }],
    },
    twitter: {
      card: 'summary',
      title: localized.title,
      description: localized.description,
      images: ['/icons/icon-512.png'],
    },
  };
}

export function buildHomepageStructuredData(locale: Locale) {
  const siteUrl = getStorefrontSiteUrl();
  const localized = copy[locale];

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: STOREFRONT_MERCHANT.name,
      alternateName: ['Brico Maitre', 'BRICOMAITRE'],
      url: siteUrl,
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/icons/icon-512.png`,
        width: 512,
        height: 512,
      },
      areaServed: { '@type': 'Country', name: 'Algeria' },
      hasMerchantReturnPolicy: buildMerchantReturnPolicy(locale),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: siteUrl,
      name: STOREFRONT_MERCHANT.name,
      alternateName: ['Brico Maitre', 'BRICOMAITRE'],
      description: copy.fr.description,
      inLanguage: ['fr-DZ', 'ar-DZ'],
      publisher: { '@id': `${siteUrl}/#organization` },
    },
  ];
}
