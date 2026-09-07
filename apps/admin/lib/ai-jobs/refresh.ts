import { startProductCatalogFeedRefreshJob } from '../background-jobs-commerce';
import { CACHE_TAGS, revalidateServerTags } from '../server-cache';
import { revalidateStorefrontProducts } from '../storefront-revalidate';

export async function refreshAppliedAiProposalConsumers(trigger = 'ai-product-content:apply') {
  try {
    revalidateServerTags(CACHE_TAGS.products, CACHE_TAGS.productsMeta);
  } catch (error) {
    console.warn('[admin] local product cache invalidation failed after proposal application', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  await Promise.allSettled([
    revalidateStorefrontProducts(),
    startProductCatalogFeedRefreshJob(trigger),
  ]);
}
