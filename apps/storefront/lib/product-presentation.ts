import type { StorefrontProductDetailResponse } from '@bric/storefront-core/contracts';

import type { Locale } from '@/i18n/config';

type Product = StorefrontProductDetailResponse['item'];

export function getLocalizedProductCopy(product: Product, locale: Locale) {
  const useArabic = locale === 'ar';
  return {
    title: useArabic && product.titleAr?.trim() ? product.titleAr.trim() : product.title.trim(),
    description:
      useArabic && product.descriptionAr?.trim()
        ? product.descriptionAr.trim()
        : (product.description?.trim() ?? ''),
    categoryName:
      useArabic && product.category?.nameAr?.trim()
        ? product.category.nameAr.trim()
        : (product.category?.name.trim() ?? null),
  };
}

export function parseProductPrice(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function formatProductPrice(value: string, locale: Locale) {
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-DZ' : 'fr-DZ', {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(parseProductPrice(value));
}

export function hasProductDiscount(product: Product) {
  return (
    product.oldPrice !== null &&
    parseProductPrice(product.oldPrice) > parseProductPrice(product.price)
  );
}
