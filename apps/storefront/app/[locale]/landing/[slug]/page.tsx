import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import '../../../styles/checkout.css';
import '../../../styles/landing-page.css';
import '../../../styles/product.css';

import { LandingOrderForm } from '@/components/landing-order-form';
import { LandingPageRenderer } from '@/components/landing-page-renderer';
import { PageShell } from '@/components/page-shell';
import { LandingPageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { buildLandingPageMetadata } from '@/lib/landing-page-seo';
import { getStorefrontLandingPage } from '@/lib/storefront-api';

type LandingPageProps = { params: Promise<{ locale: string; slug: string }> };

// Landing data remains tag-cached, but nonce-bearing HTML must be rendered for
// each request so the response CSP and every inline script share a fresh nonce.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const alternateLocale = locale === 'fr' ? 'ar' : 'fr';
  const [page, alternatePage] = await Promise.all([
    getStorefrontLandingPage(locale, slug).catch(() => null),
    getStorefrontLandingPage(alternateLocale, slug).catch(() => null),
  ]);
  if (!page) return { robots: { index: false, follow: false } };
  return buildLandingPageMetadata(page, locale, alternatePage);
}

async function LandingPageContent({ params }: LandingPageProps) {
  const [{ locale, slug }, requestHeaders] = await Promise.all([params, headers()]);
  if (!isLocale(locale)) notFound();
  const page = await getStorefrontLandingPage(locale, slug);
  if (!page) notFound();
  const alternateLocale = locale === 'fr' ? 'ar' : 'fr';
  const alternatePage = await getStorefrontLandingPage(alternateLocale, page.slug).catch(
    () => null,
  );
  return (
    <PageShell
      locale={locale}
      alternatePath={`/${alternateLocale}/landing/${encodeURIComponent(alternatePage?.slug ?? page.slug)}`}
    >
      <LandingPageRenderer
        page={page}
        locale={locale}
        nonce={requestHeaders.get('x-nonce') ?? undefined}
      />
      <LandingOrderForm page={page} locale={locale} />
    </PageShell>
  );
}

export default function LandingPage(props: LandingPageProps) {
  return (
    <Suspense fallback={<LandingPageSkeleton />}>
      <LandingPageContent {...props} />
    </Suspense>
  );
}
