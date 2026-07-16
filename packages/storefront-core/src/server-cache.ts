import { cacheLife, cacheTag, revalidateTag } from 'next/cache';

export const CACHE_TAGS = {
  assets: 'assets',
  ecotrackCatalog: 'ecotrack-catalog',
  products: 'products',
  productsMeta: 'products-meta',
  stats: 'stats',
  statsHistory: 'stats-history',
  storefrontSettings: 'storefront-settings',
} as const;

export function applyServerCache(profile: Parameters<typeof cacheLife>[0], ...tags: string[]) {
  try {
    cacheLife(profile);

    if (tags.length > 0) {
      cacheTag(...tags);
    }
  } catch {
    // Vitest and non-Next execution contexts do not provide the cache runtime.
  }
}

export function revalidateServerTags(...tags: string[]) {
  for (const tag of new Set(tags)) {
    try {
      revalidateTag(tag, 'max');
    } catch {
      // Route integration tests call handlers outside the Next request store.
    }
  }
}
