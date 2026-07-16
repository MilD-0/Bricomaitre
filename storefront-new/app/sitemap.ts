import type { MetadataRoute } from 'next';

import { getStorefrontCatalogMeta, getStorefrontSitemapProducts } from '@/lib/storefront-api';
import { buildStorefrontSitemap } from '@/lib/seo-routes';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let products: Awaited<ReturnType<typeof getStorefrontSitemapProducts>> = [];
  let taxonomy: Awaited<ReturnType<typeof getStorefrontCatalogMeta>> = { categories: [], brands: [] };
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
  return buildStorefrontSitemap(products, taxonomy);
}
