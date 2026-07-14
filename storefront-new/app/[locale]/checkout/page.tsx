import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CheckoutForm } from '@/components/checkout-form';
import { PageShell } from '@/components/page-shell';
import { isLocale } from '@/i18n/config';
import { parseProductPrice } from '@/lib/product-presentation';
import { fetchStorefrontEcotrackCatalog, getStorefrontProductDetail } from '@/lib/storefront-api';

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
    <Suspense fallback={<div className="checkout-loading" aria-busy="true" />}>
      <CheckoutPageContent {...props} />
    </Suspense>
  );
}

export async function CheckoutPageContent({ params, searchParams }: CheckoutPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const [t, catalog] = await Promise.all([
    getTranslations({ locale, namespace: 'Checkout' }),
    fetchStorefrontEcotrackCatalog().catch(() => ({ wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null })),
  ]);
  const rawProduct = Array.isArray(query.product) ? query.product[0] : query.product;
  const rawQuantity = Array.isArray(query.quantity) ? query.quantity[0] : query.quantity;
  const quantity = Math.max(1, Math.min(20, Number.parseInt(rawQuantity ?? '1', 10) || 1));
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
        labels={{
          eyebrow: t('eyebrow'), title: t('title'), description: t('description'),
          phone: t('phone'), phonePlaceholder: t('phonePlaceholder'), lastName: t('lastName'), firstName: t('firstName'),
          wilaya: t('wilaya'), commune: t('commune'), address: t('address'), email: t('email'), optional: t('optional'),
          deliveryMode: t('deliveryMode'), homeDelivery: t('homeDelivery'), officeDelivery: t('officeDelivery'), officeUnavailable: t('officeUnavailable'),
          orderSummary: t('orderSummary'), subtotal: t('subtotal'), delivery: t('delivery'), total: t('total'), quantity: t('quantity'),
          submit: t('submit'), submitting: t('submitting'), emptyTitle: t('emptyTitle'), emptyBody: t('emptyBody'), browseProducts: t('browseProducts'),
          requiredError: t('requiredError'), emailError: t('emailError'), submitError: t('submitError'), retry: t('retry'), savedAttempt: t('savedAttempt'),
          trustPhone: t('trustPhone'), trustPayment: t('trustPayment'), trustDelivery: t('trustDelivery'),
        }}
      />
    </PageShell>
  );
}
