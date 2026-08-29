import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import '../../../styles/catalog.css';

import { CategoryPageContent, resolveCategory, type CategoryPageProps } from './page-content';
import { CatalogPageSkeleton } from '@/components/storefront-skeletons';
import { buildTaxonomyCatalogMetadata, buildTaxonomyUnavailableMetadata } from '@/lib/catalog-seo';
import { parseCatalogPageQuery } from '@/lib/catalog-query';

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const [{ locale, resolution }, values] = await Promise.all([
    resolveCategory(params),
    searchParams,
  ]);
  if (resolution.status === 'missing') notFound();
  if (resolution.status === 'unavailable') return buildTaxonomyUnavailableMetadata(locale);
  const category = resolution.item;
  const query = parseCatalogPageQuery({ ...values, category: String(category.id) });
  return buildTaxonomyCatalogMetadata({
    locale,
    kind: 'category',
    name: category.name,
    nameAr: category.nameAr,
    slug: category.slug!,
    filtered: Boolean(query.q || query.brand || query.sort !== 'recommended' || query.page > 1),
  });
}

export default function CategoryPage(props: CategoryPageProps) {
  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <CategoryPageContent {...props} />
    </Suspense>
  );
}
