import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import '../../../styles/catalog.css';

import { BrandPageContent, resolveBrand, type BrandPageProps } from './page-content';
import { CatalogPageSkeleton } from '@/components/storefront-skeletons';
import { buildTaxonomyCatalogMetadata, buildTaxonomyUnavailableMetadata } from '@/lib/catalog-seo';
import { parseCatalogPageQuery } from '@/lib/catalog-query';

export async function generateMetadata({
  params,
  searchParams,
}: BrandPageProps): Promise<Metadata> {
  const [{ locale, resolution }, values] = await Promise.all([resolveBrand(params), searchParams]);
  if (resolution.status === 'missing') notFound();
  if (resolution.status === 'unavailable') return buildTaxonomyUnavailableMetadata(locale);
  const brand = resolution.item;
  const query = parseCatalogPageQuery({ ...values, brand: String(brand.id) });
  return buildTaxonomyCatalogMetadata({
    locale,
    kind: 'brand',
    name: brand.name,
    slug: brand.slug!,
    filtered: Boolean(query.q || query.category || query.sort !== 'recommended' || query.page > 1),
  });
}

export default function BrandPage(props: BrandPageProps) {
  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <BrandPageContent {...props} />
    </Suspense>
  );
}
