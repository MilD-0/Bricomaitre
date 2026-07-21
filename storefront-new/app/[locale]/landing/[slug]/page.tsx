import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { LandingPageRenderer } from '@/components/landing-page-renderer';
import { LandingOrderForm } from '@/components/landing-order-form';
import { PageShell } from '@/components/page-shell';
import { LandingPageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { buildLandingPageMetadata } from '@/lib/landing-page-seo';
import { getStorefrontLandingPage } from '@/lib/storefront-api';

type LandingPageProps = { params: Promise<{ locale: string; slug: string }> };

export const revalidate = 120;
export const dynamicParams = true;

export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const alternateLocale = locale === 'fr' ? 'ar' : 'fr';
  const [page, alternatePage] = await Promise.all([
    getStorefrontLandingPage(locale, slug).catch(() => null),
    getStorefrontLandingPage(alternateLocale, slug).catch(() => null),
  ]);
  if (!page) return { robots: { index: false, follow: false } };
  return buildLandingPageMetadata(page, locale, Boolean(alternatePage));
}

async function LandingPageContent({ params }: LandingPageProps) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const page = await getStorefrontLandingPage(locale, slug).catch(() => null);
  if (!page) notFound();
  return <PageShell locale={locale}><LandingPageRenderer page={page} locale={locale} /><LandingOrderForm page={page} locale={locale} /></PageShell>;
}

export default function LandingPage(props: LandingPageProps) {
  return <Suspense fallback={<LandingPageSkeleton />}><LandingPageContent {...props} /></Suspense>;
}
