import {
  landingPageDocumentSchema,
  type StorefrontLandingPageResponse,
} from '@bric/storefront-core/landing-pages';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildLandingPageMetadata } from './landing-page-seo';

const page: StorefrontLandingPageResponse = {
  id: 4,
  slug: 'lampe-atelier',
  locale: 'fr',
  revision: 2,
  publishedAt: '2026-07-19T00:00:00.000Z',
  document: landingPageDocumentSchema.parse({
    seo: {
      title: 'Lampe atelier',
      description: 'Une lampe conçue pour vos travaux.',
      indexable: true,
    },
    blocks: [
      {
        id: 'hero',
        type: 'product-hero',
        variant: 'media-left',
        heading: 'Lampe atelier',
        subheading: '',
        imageUrl: 'https://cdn.example.com/landing.jpg',
        imageAlt: 'Lampe allumée dans un atelier',
        primaryCtaLabel: 'Commander',
        showAddToCart: true,
      },
      {
        id: 'final',
        type: 'final-cta',
        variant: 'solid',
        heading: 'Commandez',
        body: '',
        primaryCtaLabel: 'Commander',
        imageUrl: null,
        imageAlt: '',
      },
    ],
  }),
  product: {
    id: 8,
    canonicalToken: 'lampe-atelier',
    title: 'Lampe atelier',
    titleAr: 'مصباح ورشة',
    description: null,
    descriptionAr: null,
    sku: null,
    barcode: null,
    price: '4500.00',
    oldPrice: null,
    availability: { status: 'in_stock', inStock: true, quantity: 2 },
    media: [],
    brand: null,
    category: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  },
};

describe('landing page metadata', () => {
  const originalOrigins = process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS;
  beforeAll(() => {
    process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS = 'https://cdn.example.com';
  });
  afterAll(() => {
    if (originalOrigins === undefined) delete process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS;
    else process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS = originalOrigins;
  });

  it('publishes localized alternates only when the sibling locale exists', () => {
    expect(buildLandingPageMetadata(page, 'fr', true)).toMatchObject({
      alternates: {
        languages: {
          fr: 'https://bricomaitre.com/fr/landing/lampe-atelier',
          ar: 'https://bricomaitre.com/ar/landing/lampe-atelier',
          'x-default': 'https://bricomaitre.com/fr/landing/lampe-atelier',
        },
      },
      openGraph: { siteName: 'Bricomaitre', locale: 'fr_DZ', alternateLocale: ['ar_DZ'] },
    });
    expect(buildLandingPageMetadata(page, 'fr', false).alternates).not.toHaveProperty('languages');
  });

  it('uses the campaign image and alternative text for rich social cards', () => {
    expect(buildLandingPageMetadata(page, 'fr', true)).toMatchObject({
      openGraph: {
        images: [
          { url: 'https://cdn.example.com/landing.jpg', alt: 'Lampe allumée dans un atelier' },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Lampe atelier',
        images: [
          { url: 'https://cdn.example.com/landing.jpg', alt: 'Lampe allumée dans un atelier' },
        ],
      },
    });
  });
});
