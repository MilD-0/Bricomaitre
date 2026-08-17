import type { ProductPayloadInput, ProductRecord } from '../../lib/products';

const DEFAULT_STOREFRONT_BASE_URL = 'https://bricomaitre.com';

function getStorefrontBaseUrl() {
  const value = process.env.NEXT_PUBLIC_STOREFRONT_BASE_URL ?? DEFAULT_STOREFRONT_BASE_URL;
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function slugifyDraftProduct(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'product';
}

export function buildStorefrontProductHref(product: Pick<ProductRecord, 'id' | 'slug'>) {
  const token = product.slug ?? product.id;
  return `${getStorefrontBaseUrl()}/products/${encodeURIComponent(String(token))}`;
}

export function buildDraftPromoHref(
  values: Pick<Partial<ProductPayloadInput>, 'slug' | 'title'>,
  code: string,
) {
  const token = values.slug?.trim() || slugifyDraftProduct(values.title ?? '');
  const url = new URL(`/products/${encodeURIComponent(token)}`, getStorefrontBaseUrl());
  url.searchParams.set('promo', code);
  return url.toString();
}
