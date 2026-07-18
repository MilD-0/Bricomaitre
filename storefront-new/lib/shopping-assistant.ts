import type {
  StorefrontProductDetailResponse,
  StorefrontProductsResponse,
} from '@bric/storefront-core/contracts';
import type { ShoppingAssistantProduct } from '@bric/storefront-core/shopping-assistant-contracts';

import type { Locale } from '@/i18n/config';

type CatalogProduct = StorefrontProductsResponse['items'][number];
type ProductDetail = StorefrontProductDetailResponse['item'];

function compact(value: string | null, limit = 500) {
  if (!value) return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

export function toAssistantCatalogProduct(
  product: CatalogProduct,
  meta?: { brand?: string | null; category?: string | null },
): ShoppingAssistantProduct {
  return {
    id: product.id,
    token: product.slug || product.mongoId || String(product.id),
    title: product.title,
    titleAr: product.titleAr,
    description: compact(product.description),
    descriptionAr: compact(product.descriptionAr),
    price: product.price,
    oldPrice: product.oldPrice,
    inStock: product.inStock,
    availabilityStatus: product.availabilityStatus,
    imageUrl: product.images[0] ?? null,
    brand: meta?.brand ?? null,
    category: meta?.category ?? null,
  };
}

export function toAssistantDetailProduct(product: ProductDetail): ShoppingAssistantProduct {
  return {
    id: product.id,
    token: product.canonicalToken,
    title: product.title,
    titleAr: product.titleAr,
    description: compact(product.description),
    descriptionAr: compact(product.descriptionAr),
    price: product.price,
    oldPrice: product.oldPrice,
    inStock: product.availability.inStock,
    availabilityStatus: product.availability.status,
    imageUrl: product.media[0]?.url ?? null,
    brand: product.brand?.name ?? null,
    category: product.category?.name ?? null,
  };
}

export function shoppingAssistantInstructions(locale: Locale) {
  return [
    'You are the Bricomaitre customer product advisor.',
    'Help customers discover and compare tools using only products returned by the catalog tools.',
    'Search before making any product recommendation or claim. Use product lookup before detailed comparisons.',
    'Never mention internal systems, administration, analytics, margins, purchase cost, or private data.',
    'Never invent specifications, compatibility, availability, delivery promises, warranty, discounts, promotions, or safety claims.',
    'If managed catalog information is incomplete, say exactly what is missing and suggest opening the product page or contacting Bricomaitre.',
    'Clearly identify unavailable products. Do not claim to add anything to cart or place an order.',
    'Keep recommendations focused: normally show at most three strong options and briefly explain the catalog evidence for each.',
    `Answer in ${locale === 'ar' ? 'Arabic' : 'French'} unless the customer clearly uses another language.`,
  ].join(' ');
}

export function deterministicAssistantMessage(locale: Locale, productCount: number) {
  if (locale === 'ar') {
    return productCount > 0
      ? 'تعذر تشغيل المستشار الذكي مؤقتًا، لكن هذه أقرب النتائج المتوفرة في الكتالوج. افتح صفحة المنتج للتأكد من التفاصيل.'
      : 'تعذر تشغيل المستشار الذكي مؤقتًا ولم أجد نتيجة مطابقة. يمكنك متابعة البحث في الكتالوج.';
  }
  return productCount > 0
    ? 'Le conseiller intelligent est momentanément indisponible, mais voici les résultats les plus proches du catalogue. Ouvrez un produit pour vérifier ses détails.'
    : 'Le conseiller intelligent est momentanément indisponible et aucun résultat proche n’a été trouvé. Vous pouvez poursuivre dans le catalogue.';
}
