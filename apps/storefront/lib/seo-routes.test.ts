import { describe, expect, it } from 'vitest';

import { buildStorefrontRobots, buildStorefrontSitemap } from './seo-routes';

const product = {
  id: 12,
  slug: 'clé à choc',
  mongoId: null,
  updatedAt: '2026-07-02T10:00:00.000Z',
};

describe('SEO metadata routes', () => {
  it('builds localized homepage, catalog, taxonomy, and deduplicated product entries', () => {
    const sitemap = buildStorefrontSitemap([product, product], {
      categories: [{ slug: 'eclairage', updatedAt: product.updatedAt }],
      brands: [{ slug: 'wadfow', updatedAt: product.updatedAt }],
    });

    expect(sitemap).toHaveLength(10);
    expect(sitemap).toContainEqual(
      expect.objectContaining({
        url: 'https://bricomaitre.com/fr/categories/eclairage',
        alternates: {
          languages: expect.objectContaining({
            ar: 'https://bricomaitre.com/ar/categories/eclairage',
          }),
        },
      }),
    );
    expect(sitemap).toContainEqual(
      expect.objectContaining({
        url: 'https://bricomaitre.com/fr/products/cl%C3%A9%20%C3%A0%20choc',
        lastModified: new Date(product.updatedAt),
        alternates: {
          languages: expect.objectContaining({
            fr: 'https://bricomaitre.com/fr/products/cl%C3%A9%20%C3%A0%20choc',
            ar: 'https://bricomaitre.com/ar/products/cl%C3%A9%20%C3%A0%20choc',
          }),
        },
      }),
    );
  });

  it('retains legacy and numeric product tokens when a slug is absent', () => {
    const entries = buildStorefrontSitemap([
      { ...product, slug: null, mongoId: 'legacy-product' },
      { ...product, id: 13, slug: null },
    ]);
    expect(entries.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        'https://bricomaitre.com/fr/products/legacy-product',
        'https://bricomaitre.com/ar/products/legacy-product',
        'https://bricomaitre.com/fr/products/13',
        'https://bricomaitre.com/ar/products/13',
      ]),
    );
  });

  it('keeps private transactional routes out of crawling', () => {
    expect(buildStorefrontRobots()).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: expect.arrayContaining(['/api/', '/fr/checkout', '/ar/thank-you']),
      },
      sitemap: 'https://bricomaitre.com/sitemap.xml',
      host: 'https://bricomaitre.com',
    });
    expect(buildStorefrontRobots().rules).not.toEqual(
      expect.objectContaining({
        disallow: expect.arrayContaining(['/fr/landing/', '/ar/landing/']),
      }),
    );
  });
});
