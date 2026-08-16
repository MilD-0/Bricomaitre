import { describe, expect, it } from 'vitest';

import { buildHomepageMetadata, buildHomepageStructuredData } from './homepage-seo';

describe('homepage SEO', () => {
  it('publishes localized canonical, alternate, and social metadata', () => {
    expect(buildHomepageMetadata('ar')).toMatchObject({
      title: 'أدوات ومعدات الأشغال والبناء',
      alternates: {
        canonical: 'https://bricomaitre.com/ar',
        languages: {
          fr: 'https://bricomaitre.com/fr',
          ar: 'https://bricomaitre.com/ar',
          'x-default': 'https://bricomaitre.com/fr',
        },
      },
      robots: { index: true, follow: true },
      openGraph: { locale: 'ar_DZ', alternateLocale: ['fr_DZ'] },
      twitter: { card: 'summary', images: ['/icons/icon-512.png'] },
    });
  });

  it('describes the organization and localized website in structured data', () => {
    expect(buildHomepageStructuredData('fr')).toMatchObject([
      {
        '@type': 'Organization',
        url: 'https://bricomaitre.com',
        name: 'Bricomaitre',
        areaServed: { name: 'Algeria' },
        hasMerchantReturnPolicy: { returnFees: 'https://schema.org/FreeReturn' },
      },
      {
        '@type': 'WebSite',
        url: 'https://bricomaitre.com',
        name: 'Bricomaitre',
        inLanguage: ['fr-DZ', 'ar-DZ'],
      },
    ]);
  });
});
