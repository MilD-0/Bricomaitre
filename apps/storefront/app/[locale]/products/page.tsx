import type { Metadata } from 'next';

import '../../styles/catalog.css';

import { CatalogPageContent, resolveCatalogLocale, type CatalogPageProps } from './page-content';
import { isFilteredCatalog, parseCatalogPageQuery } from '@/lib/catalog-query';
import { buildCatalogMetadata } from '@/lib/catalog-seo';

export async function generateMetadata({
  params,
  searchParams,
}: CatalogPageProps): Promise<Metadata> {
  const [locale, values] = await Promise.all([resolveCatalogLocale(params), searchParams]);
  return buildCatalogMetadata(locale, isFilteredCatalog(parseCatalogPageQuery(values)));
}

export default async function CatalogPage(props: CatalogPageProps) {
  return CatalogPageContent(props);
}
