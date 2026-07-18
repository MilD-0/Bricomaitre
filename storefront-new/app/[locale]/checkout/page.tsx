import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CheckoutForm } from '@/components/checkout-form';
import { PageShell } from '@/components/page-shell';
import { CheckoutPageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { parseProductPrice } from '@/lib/product-presentation';
import { buildCheckoutLabels } from '@/lib/checkout-labels';
import { getStorefrontEcotrackCatalog, getStorefrontProductDetail, getStorefrontSettings } from '@/lib/storefront-api';
import { defaultStorefrontSettingsResponse } from '@bric/storefront-core/contracts';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

type CheckoutPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function CheckoutPage(props: CheckoutPageProps) {
  return (
    <Suspense fallback={<CheckoutPageSkeleton />}>
      <CheckoutPageContent {...props} />
    </Suspense>
  );
}

export async function CheckoutPageContent({ params, searchParams }: CheckoutPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const [t, catalog, contact] = await Promise.all([
    getTranslations({ locale, namespace: 'Checkout' }),
    getStorefrontEcotrackCatalog().catch(() => ({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null })),
    getStorefrontSettings().catch(() => defaultStorefrontSettingsResponse),
  ]);
  const rawProduct = Array.isArray(query.product) ? query.product[0] : query.product;
  const rawQuantity = Array.isArray(query.quantity) ? query.quantity[0] : query.quantity;
  const quantity = Math.max(1, Math.min(20, Number.parseInt(rawQuantity ?? '1', 10) || 1));
  const rawLandingPageId = Array.isArray(query.landing) ? query.landing[0] : query.landing;
  const rawLandingRevision = Array.isArray(query.landingRevision) ? query.landingRevision[0] : query.landingRevision;
  const landingPageId = Number.parseInt(rawLandingPageId ?? '', 10);
  const landingRevision = Number.parseInt(rawLandingRevision ?? '', 10);
  const detail = rawProduct ? await getStorefrontProductDetail(rawProduct).catch(() => null) : null;
  const product = detail?.item;
  const directItem = product ? {
    productId: product.id,
    token: product.canonicalToken,
    title: locale === 'ar' && product.titleAr?.trim() ? product.titleAr : product.title,
    imageUrl: product.media[0]?.url ?? null,
    unitPrice: parseProductPrice(product.price),
    quantity,
    availabilityStatus: product.availability.status,
  } : null;

  return (
    <PageShell locale={locale}>
      <CheckoutForm
        locale={locale}
        catalog={catalog}
        directItem={directItem}
        landingAttribution={Number.isInteger(landingPageId) && landingPageId > 0 && Number.isInteger(landingRevision) && landingRevision > 0 ? { landingPageId, landingRevision } : undefined}
        labels={buildCheckoutLabels(t)}
        support={{ contact, labels: { title: t('supportTitle'), description: t('supportDescription'), call: t('supportCall') } }}
      />
    </PageShell>
  );
}
