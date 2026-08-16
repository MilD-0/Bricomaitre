import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CatalogPageContent } from '@/app/[locale]/products/page-content';
import { CatalogUnavailable } from '@/components/catalog-unavailable';
import { CatalogPageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { buildTaxonomyCatalogCopy } from '@/lib/catalog-seo';
import type { CatalogSearchParams } from '@/lib/catalog-query';
import { captureCatalogPageException } from '@/lib/sentry';
import { resolveCategorySlug } from '@/lib/taxonomy-resolution';

export type CategoryPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export async function resolveCategory(params: CategoryPageProps['params']) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, slug, resolution: await resolveCategorySlug(slug) };
}

export async function CategoryPageContent({ params, searchParams }: CategoryPageProps) {
  const { locale, resolution } = await resolveCategory(params);
  if (resolution.status === 'missing') notFound();
  if (resolution.status === 'unavailable') {
    captureCatalogPageException(resolution.error, { locale, operation: 'category-resolution' });
    return <CatalogUnavailable locale={locale} />;
  }
  const category = resolution.item;
  const heading = buildTaxonomyCatalogCopy({
    locale,
    kind: 'category',
    name: category.name,
    nameAr: category.nameAr,
  });
  const scopedSearchParams = searchParams.then((values) => ({
    ...values,
    category: String(category.id),
  }));
  return (
    <Suspense fallback={<CatalogPageSkeleton />}>
      <CatalogPageContent
        params={Promise.resolve({ locale })}
        searchParams={scopedSearchParams}
        heading={heading}
      />
    </Suspense>
  );
}
