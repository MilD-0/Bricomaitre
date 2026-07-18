import type { Metadata } from 'next';
import { defaultStorefrontSettingsResponse, type StorefrontHomepageResponse } from '@bric/storefront-core/contracts';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Homepage } from '@/components/homepage';
import { PageShell } from "@/components/page-shell";
import { HomePageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { buildHomepageMetadata, buildHomepageStructuredData } from '@/lib/homepage-seo';
import { serializeStructuredData } from '@/lib/product-seo';
import { getStorefrontHomepage, getStorefrontSettings } from '@/lib/storefront-api';

type HomePageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Pick<HomePageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = isLocale(locale) ? locale : 'fr';
  return buildHomepageMetadata(activeLocale);
}

const emptyHomepage: StorefrontHomepageResponse = {
  banners: [],
  topProducts: [],
  categories: [],
  productCards: [],
  brands: [],
  featuredGroups: [],
};

export default function HomePage(props: HomePageProps) {
  return <Suspense fallback={<HomePageSkeleton />}><HomePageContent {...props} /></Suspense>;
}

export async function HomePageContent({ params }: HomePageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let data = emptyHomepage;
  let contact = defaultStorefrontSettingsResponse;
  try {
    data = await getStorefrontHomepage();
  } catch {
    data = emptyHomepage;
  }
  try {
    contact = await getStorefrontSettings();
  } catch {
    contact = defaultStorefrontSettingsResponse;
  }

  return (
    <PageShell locale={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(buildHomepageStructuredData(locale)) }}
      />
      <Homepage data={data} locale={locale} contact={contact} />
    </PageShell>
  );
}
