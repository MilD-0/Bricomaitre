import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CatalogPageContent } from '@/app/[locale]/products/page';
import { CatalogUnavailable } from '@/components/catalog-unavailable';
import { CatalogPageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { buildTaxonomyCatalogCopy, buildTaxonomyCatalogMetadata, buildTaxonomyUnavailableMetadata } from '@/lib/catalog-seo';
import { parseCatalogPageQuery, type CatalogSearchParams } from '@/lib/catalog-query';
import { captureCatalogPageException } from '@/lib/sentry';
import { resolveCategorySlug } from '@/lib/taxonomy-resolution';

type CategoryPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

async function resolveCategory(params: CategoryPageProps['params']) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, slug, resolution: await resolveCategorySlug(slug) };
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const [{ locale, resolution }, values] = await Promise.all([resolveCategory(params), searchParams]);
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

export async function CategoryPageContent({ params, searchParams }: CategoryPageProps) {
  const { locale, resolution } = await resolveCategory(params);
  if (resolution.status === 'missing') notFound();
  if (resolution.status === 'unavailable') {
    captureCatalogPageException(resolution.error, { locale, operation: 'category-resolution' });
    return <CatalogUnavailable locale={locale} />;
  }
  const category = resolution.item;
  const heading = buildTaxonomyCatalogCopy({ locale, kind: 'category', name: category.name, nameAr: category.nameAr });
  const scopedSearchParams = searchParams.then((values) => ({ ...values, category: String(category.id) }));
  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <CatalogPageContent params={Promise.resolve({ locale })} searchParams={scopedSearchParams} heading={heading} />
    </Suspense>
  );
}

export default function CategoryPage(props: CategoryPageProps) {
  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <CategoryPageContent {...props} />
    </Suspense>
  );
}
