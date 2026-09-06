import type { MetadataRoute } from 'next';

import { buildStorefrontSitemap } from '@/lib/seo-routes';
import { getStorefrontCatalogMeta, getStorefrontSitemapProducts } from '@/lib/storefront-api';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Independent sources preserve the remaining discovery routes during a partial outage.
  const [products, taxonomy] = await Promise.all([
    getStorefrontSitemapProducts().catch(() => []),
    getStorefrontCatalogMeta().catch(() => ({ categories: [], brands: [] })),
  ]);
  return buildStorefrontSitemap(products, taxonomy);
}
