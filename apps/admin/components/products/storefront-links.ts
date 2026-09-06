import type { ProductPayloadInput, ProductRecord } from '../../lib/products';

import { getStorefrontPublicBaseUrl } from '../../lib/storefront-public-url';

function slugifyDraftProduct(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'product';
}

export function buildStorefrontProductHref(
  product: Pick<ProductRecord, 'id' | 'slug'>,
  baseUrl = getStorefrontPublicBaseUrl(),
) {
  const token = product.slug ?? product.id;
  return `${baseUrl.replace(/\/+$/, '')}/products/${encodeURIComponent(String(token))}`;
}

export function buildDraftPromoHref(
  values: Pick<Partial<ProductPayloadInput>, 'slug' | 'title'>,
  code: string,
  baseUrl = getStorefrontPublicBaseUrl(),
) {
  const token = values.slug?.trim() || slugifyDraftProduct(values.title ?? '');
  const url = new URL(`/products/${encodeURIComponent(token)}`, baseUrl);
  url.searchParams.set('promo', code);
  return url.toString();
}
