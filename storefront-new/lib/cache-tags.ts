export const STOREFRONT_NEW_CACHE_TAGS = {
  assets: 'storefront-new-assets',
  products: 'storefront-new-products',
  productMeta: 'storefront-new-product-meta',
  settings: 'storefront-new-settings',
} as const;

export function getStorefrontProductCacheTag(token: string) {
  return `storefront-new-product:${token.trim()}`;
}
