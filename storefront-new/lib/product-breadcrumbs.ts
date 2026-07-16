import type { Locale } from '@/i18n/config';
import { getCategoryPath } from '@/lib/taxonomy-routes';

type CategoryNode = {
  id: number;
  name: string;
  nameAr: string | null;
  slug: string | null;
  parentId: number | null;
};

export type ProductCategoryBreadcrumb = {
  id: number;
  label: string;
  href: string;
};

export function buildProductCategoryBreadcrumbs(
  currentCategory: CategoryNode | null,
  categories: CategoryNode[],
  locale: Locale,
): ProductCategoryBreadcrumb[] {
  if (!currentCategory) return [];

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  categoryById.set(currentCategory.id, {
    ...categoryById.get(currentCategory.id),
    ...currentCategory,
  });

  const visited = new Set<number>();
  const chain: CategoryNode[] = [];
  let category: CategoryNode | undefined = categoryById.get(currentCategory.id);

  while (category && !visited.has(category.id)) {
    visited.add(category.id);
    chain.push(category);
    category = category.parentId === null ? undefined : categoryById.get(category.parentId);
  }

  return chain.reverse().map((entry) => ({
    id: entry.id,
    label: locale === 'ar' && entry.nameAr?.trim() ? entry.nameAr.trim() : entry.name,
    href: getCategoryPath(locale, entry),
  }));
}
