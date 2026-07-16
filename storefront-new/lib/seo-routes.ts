import type { MetadataRoute } from 'next';
import type { StorefrontProductsResponse } from '@bric/storefront-core/contracts';

import { locales } from '@/i18n/config';
import { getStorefrontSiteUrl } from './site-url';

type SitemapProduct = StorefrontProductsResponse['items'][number];
type SitemapTaxonomy = { slug: string | null; updatedAt: string };

function localizedAlternates(path: string) {
  const siteUrl = getStorefrontSiteUrl();
  return {
    languages: {
      ...Object.fromEntries(locales.map((locale) => [locale, `${siteUrl}/${locale}${path}`])),
      'x-default': `${siteUrl}/fr${path}`,
    },
  };
}

export function buildStorefrontSitemap(
  products: SitemapProduct[],
  taxonomy: { categories: SitemapTaxonomy[]; brands: SitemapTaxonomy[] } = { categories: [], brands: [] },
): MetadataRoute.Sitemap {
  const siteUrl = getStorefrontSiteUrl();
  const staticEntries: MetadataRoute.Sitemap = locales.flatMap((locale) => [
    {
      url: `${siteUrl}/${locale}`,
      changeFrequency: 'daily' as const,
      priority: 1,
      alternates: localizedAlternates(''),
    },
    {
      url: `${siteUrl}/${locale}/products`,
      changeFrequency: 'daily' as const,
      priority: 0.9,
      alternates: localizedAlternates('/products'),
    },
  ]);

  const uniqueProducts = new Map<string, SitemapProduct>();
  for (const product of products) {
    const token = product.slug?.trim() || product.mongoId?.trim() || String(product.id);
    if (!uniqueProducts.has(token)) uniqueProducts.set(token, product);
  }

  const productEntries: MetadataRoute.Sitemap = [...uniqueProducts.entries()].flatMap(([token, product]) => {
    const path = `/products/${encodeURIComponent(token)}`;
    return locales.map((locale) => ({
      url: `${siteUrl}/${locale}${path}`,
      lastModified: new Date(product.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      alternates: localizedAlternates(path),
    }));
  });

  const taxonomyEntries: MetadataRoute.Sitemap = (['categories', 'brands'] as const).flatMap((kind) => {
    const unique = new Map<string, SitemapTaxonomy>();
    for (const entry of taxonomy[kind]) {
      const slug = entry.slug?.trim();
      if (slug) unique.set(slug, entry);
    }
    return [...unique.entries()].flatMap(([slug, entry]) => {
      const path = `/${kind}/${encodeURIComponent(slug)}`;
      return locales.map((locale) => ({
        url: `${siteUrl}/${locale}${path}`,
        lastModified: new Date(entry.updatedAt),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
        alternates: localizedAlternates(path),
      }));
    });
  });

  return [...staticEntries, ...taxonomyEntries, ...productEntries];
}

export function buildStorefrontRobots(): MetadataRoute.Robots {
  const siteUrl = getStorefrontSiteUrl();
  const privatePaths = [
    '/api/',
    '/fr/checkout',
    '/ar/checkout',
    '/fr/thank-you',
    '/ar/thank-you',
    '/fr/cart',
    '/ar/cart',
    '/fr/collections/',
    '/ar/collections/',
    '/fr/landing/',
    '/ar/landing/',
  ];

  return {
    rules: { userAgent: '*', allow: '/', disallow: privatePaths },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
