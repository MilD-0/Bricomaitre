import type { Metadata } from 'next';
import { Suspense } from 'react';

import { HomePageContent, type HomePageProps } from './page-content';
import { HomePageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { buildHomepageMetadata } from '@/lib/homepage-seo';

export async function generateMetadata({
  params,
}: Pick<HomePageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const activeLocale = isLocale(locale) ? locale : 'fr';
  return buildHomepageMetadata(activeLocale);
}

export default function HomePage(props: HomePageProps) {
  return (
    <Suspense fallback={<HomePageSkeleton />}>
      <HomePageContent {...props} />
    </Suspense>
  );
}
