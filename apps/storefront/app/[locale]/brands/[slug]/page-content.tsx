import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CatalogPageContent } from '@/app/[locale]/products/page-content';
import { CatalogUnavailable } from '@/components/catalog-unavailable';
import { CatalogPageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { buildTaxonomyCatalogCopy } from '@/lib/catalog-seo';
import type { CatalogSearchParams } from '@/lib/catalog-query';
import { captureCatalogPageException } from '@/lib/sentry';
import { resolveBrandSlug } from '@/lib/taxonomy-resolution';

export type BrandPageProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<CatalogSearchParams>;
};

export async function resolveBrand(params: BrandPageProps['params']) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, slug, resolution: await resolveBrandSlug(slug) };
}

export async function BrandPageContent({ params, searchParams }: BrandPageProps) {
  const { locale, resolution } = await resolveBrand(params);
  if (resolution.status === 'missing') notFound();
  if (resolution.status === 'unavailable') {
    captureCatalogPageException(resolution.error, { locale, operation: 'brand-resolution' });
    return <CatalogUnavailable locale={locale} />;
  }
  const brand = resolution.item;
  const heading = buildTaxonomyCatalogCopy({ locale, kind: 'brand', name: brand.name });
  const scopedSearchParams = searchParams.then((values) => ({
    ...values,
    brand: String(brand.id),
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
