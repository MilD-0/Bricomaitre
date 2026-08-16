import type { Metadata } from 'next';
import { Suspense } from 'react';

import {
  CatalogNoScriptCatalog,
  CatalogPageContent,
  resolveCatalogLocale,
  type CatalogPageProps,
} from './page-content';
import { CatalogPageSkeleton } from '@/components/storefront-skeletons';
import { isFilteredCatalog, parseCatalogPageQuery } from '@/lib/catalog-query';
import { buildCatalogMetadata } from '@/lib/catalog-seo';

export async function generateMetadata({
  params,
  searchParams,
}: CatalogPageProps): Promise<Metadata> {
  const [locale, values] = await Promise.all([resolveCatalogLocale(params), searchParams]);
  return buildCatalogMetadata(locale, isFilteredCatalog(parseCatalogPageQuery(values)));
}

export default function CatalogPage(props: CatalogPageProps) {
  return (
    <>
      <CatalogNoScriptCatalog />
      <Suspense fallback={<CatalogPageSkeleton />}>
        <CatalogPageContent {...props} />
      </Suspense>
    </>
  );
}
