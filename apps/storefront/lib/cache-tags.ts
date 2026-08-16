export const STOREFRONT_CACHE_TAGS = {
  assets: 'storefront-assets',
  products: 'storefront-products',
  productMeta: 'storefront-product-meta',
  settings: 'storefront-settings',
  landingPages: 'storefront-landing-pages',
} as const;

export function getStorefrontProductCacheTag(token: string) {
  return `storefront-product:${token.trim()}`;
}

export function getStorefrontLandingPageCacheTag(locale: string, slug: string) {
  return `storefront-landing:${locale.trim()}:${slug.trim()}`;
}
