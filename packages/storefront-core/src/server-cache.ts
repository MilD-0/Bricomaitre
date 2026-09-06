import { revalidateTag } from 'next/cache';

export const CACHE_TAGS = {
  assets: 'assets',
  ecotrackCatalog: 'ecotrack-catalog',
  products: 'products',
  productsMeta: 'products-meta',
  stats: 'stats',
  statsHistory: 'stats-history',
  storefrontSettings: 'storefront-settings',
  landingPages: 'landing-pages',
} as const;

export function revalidateServerTags(...tags: string[]) {
  for (const tag of new Set(tags)) {
    // A downstream cache must not refill from an upstream stale response after publication.
    revalidateTag(tag, { expire: 0 });
  }
}
