import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Homepage } from '@/components/homepage';
import { PageShell } from "@/components/page-shell";
import { isLocale } from '@/i18n/config';
import { homepageCopy, mockHomepageResponse } from '@/lib/homepage-mock';
import { getStorefrontHomepage } from '@/lib/storefront-api';

type HomePageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Pick<HomePageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = isLocale(locale) ? locale : 'fr';
  const copy = homepageCopy[activeLocale];
  return { title: copy.heroTitle, description: copy.heroText };
}

export default function HomePage(props: HomePageProps) {
  return <Suspense fallback={<div className="home-loading" aria-busy="true" />}><HomePageContent {...props} /></Suspense>;
}

export async function HomePageContent({ params }: HomePageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  let upstream: Awaited<ReturnType<typeof getStorefrontHomepage>> | null = null;
  try {
    upstream = await getStorefrontHomepage();
  } catch {
    upstream = null;
  }
  const data = upstream && Object.values(upstream).some((items) => items.length > 0)
    ? upstream
    : mockHomepageResponse;

  return (
    <PageShell locale={locale}>
      <Homepage data={data} locale={locale} />
    </PageShell>
  );
}
