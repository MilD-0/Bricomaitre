import type { LegacyProduct } from './storefront-api';

export type ShopperProduct = {
  id: number;
  slug: string;
  title: string;
  titleAr: string;
  summary: string;
  summaryAr: string;
  price: number;
  oldPrice: number | null;
  inStock: boolean;
  availabilityStatus: string;
  brand: string | null;
  category: string | null;
  image: string | null;
};

function truncate(value: string, length = 360) {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

export function toShopperProduct(product: LegacyProduct): ShopperProduct {
  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    titleAr: product.title_ar,
    summary: truncate(product.summary || product.description || ''),
    summaryAr: truncate(product.summary_ar || product.description_ar || ''),
    price: product.price,
    oldPrice: product.oldPrice,
    inStock: product.inStock,
    availabilityStatus: product.availabilityStatus,
    brand: product.brandInfo?.name ?? null,
    category: product.categoryInfo?.name ?? null,
    image: product.images[0] ?? null,
  };
}

export function shopperAssistantInstructions(locale: string) {
  return [
    'You are the Bricomaitre shopping assistant for customers.',
    'Help shoppers discover, compare, and understand products using only the catalog tools.',
    'Never mention internal systems, margin, analytics, administration, or private product data.',
    'Never invent product specifications, compatibility, availability, delivery terms, warranties, discounts, or safety claims.',
    'For a product question, search the catalog or inspect the product before answering. State when catalog information is unavailable or incomplete.',
    'Recommend only products returned by tools and clearly identify out-of-stock products.',
    'Do not take orders, collect personal information, or claim a product was added to the cart. Point shoppers to the product page instead.',
    `Reply in ${locale === 'ar' ? 'Arabic' : 'French'} unless the shopper writes in another language. Keep the answer concise and helpful.`,
  ].join(' ');
}
