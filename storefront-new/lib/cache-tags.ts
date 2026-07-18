export const STOREFRONT_NEW_CACHE_TAGS = {
  assets: 'storefront-new-assets',
  products: 'storefront-new-products',
  productMeta: 'storefront-new-product-meta',
  settings: 'storefront-new-settings',
  landingPages: 'storefront-new-landing-pages',
} as const;

export function getStorefrontProductCacheTag(token: string) {
  return `storefront-new-product:${token.trim()}`;
}

export function getStorefrontLandingPageCacheTag(locale: string, slug: string) {
  return `storefront-new-landing:${locale.trim()}:${slug.trim()}`;
}
