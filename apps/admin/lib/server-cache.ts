export { revalidateServerTags } from '@bric/storefront-core/server-cache';

export const CACHE_TAGS = {
  products: 'products',
  productsMeta: 'products-meta',
  ecotrack: 'ecotrack',
  stats: 'stats',
  statsHistory: 'stats-history',
} as const;
