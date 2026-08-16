import type { Locale } from '@/i18n/config';

type SluggedTaxonomy = {
  id: number;
  slug?: string | null;
};

function routeSegment(slug: string | null | undefined) {
  const normalized = slug?.trim();
  return normalized ? encodeURIComponent(normalized) : null;
}

export function getCategoryPath(locale: Locale, category: SluggedTaxonomy) {
  const slug = routeSegment(category.slug);
  return slug ? `/${locale}/categories/${slug}` : `/${locale}/products?category=${category.id}`;
}

export function getBrandPath(locale: Locale, brand: SluggedTaxonomy) {
  const slug = routeSegment(brand.slug);
  return slug ? `/${locale}/brands/${slug}` : `/${locale}/products?brand=${brand.id}`;
}

export function findTaxonomyBySlug<T extends SluggedTaxonomy>(items: T[], slug: string) {
  const normalized = slug.trim();
  return items.find((item) => item.slug?.trim() === normalized) ?? null;
}
