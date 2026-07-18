import type { MetadataRoute } from 'next';

import { getStorefrontCatalogMeta, getStorefrontSitemapLandingPages, getStorefrontSitemapProducts } from '@/lib/storefront-api';
import { buildStorefrontSitemap } from '@/lib/seo-routes';
import { getStorefrontSiteUrl } from '@/lib/site-url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let products: Awaited<ReturnType<typeof getStorefrontSitemapProducts>> = [];
  let taxonomy: Awaited<ReturnType<typeof getStorefrontCatalogMeta>> = { categories: [], brands: [] };
  let landingPages: Awaited<ReturnType<typeof getStorefrontSitemapLandingPages>>['items'] = [];
  try {
    products = await getStorefrontSitemapProducts();
  } catch {
    // Keep the stable public entry points discoverable during a catalog outage.
  }
  try {
    taxonomy = await getStorefrontCatalogMeta();
  } catch {
    // Product and static routes remain useful even when taxonomy metadata is unavailable.
  }
  try {
    landingPages = (await getStorefrontSitemapLandingPages()).items;
  } catch {
    // Stable catalog discovery remains available during a landing-page outage.
  }
  const siteUrl = getStorefrontSiteUrl();
  return [...buildStorefrontSitemap(products, taxonomy), ...landingPages.map((page) => ({
    url: `${siteUrl}/${page.locale}/landing/${encodeURIComponent(page.slug)}`,
    lastModified: new Date(page.updatedAt),
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }))];
}
