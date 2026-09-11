import { startProductCatalogFeedRefreshJob } from './background-jobs-commerce';
import { refreshAnalyticsFactsAfterMutation } from './analytics-facts';
import { CACHE_TAGS, revalidateServerTags } from './server-cache';
import {
  revalidateStorefrontAssets,
  revalidateStorefrontLandingPages,
  revalidateStorefrontProductMeta,
  revalidateStorefrontProducts,
} from './storefront-revalidate';

export async function refreshActionHistoryConsumers(resource: string) {
  const work: Promise<unknown>[] = [];
  if (resource === 'products' || resource === 'brandsCategories') {
    try {
      revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
    } catch (error) {
      console.error('Recovery committed, but local product cache invalidation failed.', error);
    }
    work.push(
      revalidateStorefrontProducts(),
      revalidateStorefrontLandingPages(),
      startProductCatalogFeedRefreshJob('action-history:recover'),
    );
    if (resource === 'brandsCategories') work.push(revalidateStorefrontProductMeta());
  }
  if (resource === 'assets') work.push(revalidateStorefrontAssets());
  if (resource === 'stats') work.push(refreshAnalyticsFactsAfterMutation());
  const results = await Promise.allSettled(work);
  for (const result of results) {
    if (result.status === 'rejected')
      console.error('Recovery committed, but a consumer refresh failed.', result.reason);
  }
}
