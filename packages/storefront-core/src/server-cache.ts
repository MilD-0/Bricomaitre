import { revalidateTag, unstable_cache } from 'next/cache';

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

export function createServerCache<TArgs extends unknown[], TResult>(options: {
  keyParts: string[];
  revalidate: number;
  tags: string[];
  load: (...args: TArgs) => Promise<TResult>;
}) {
  return unstable_cache(options.load, options.keyParts, {
    revalidate: options.revalidate,
    tags: options.tags,
  });
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
