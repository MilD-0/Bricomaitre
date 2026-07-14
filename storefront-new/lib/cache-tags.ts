export const STOREFRONT_NEW_CACHE_TAGS = {
  products: 'storefront-new-products',
  productMeta: 'storefront-new-product-meta',
} as const;

export function getStorefrontProductCacheTag(token: string) {
  return `storefront-new-product:${token.trim()}`;
}
