import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import '../../styles/checkout.css';

import { PageShell } from '@/components/page-shell';
import { ThankYouConfirmation } from '@/components/thank-you-confirmation';
import { ThankYouPageSkeleton } from '@/components/storefront-skeletons';
import { isLocale } from '@/i18n/config';
import { fetchStorefrontOrderByToken, getStorefrontSettings } from '@/lib/storefront-api';
import { defaultStorefrontSettingsResponse } from '@bric/storefront-core/contracts';

type ThankYouPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: Pick<ThankYouPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const arabic = locale === 'ar';

  return {
    title: arabic ? 'تأكيد الطلب' : 'Confirmation de commande',
    description: arabic
      ? 'تابع تأكيد طلبك وحالة التوصيل لدى بريكوماتر.'
      : 'Consultez la confirmation de votre commande Bricomaitre et son état de livraison.',
    robots: { index: false, follow: false },
    referrer: 'no-referrer',
  };
}

export default function ThankYouPage(props: ThankYouPageProps) {
  return (
    <Suspense fallback={<ThankYouPageSkeleton />}>
      <ThankYouPageContent {...props} />
    </Suspense>
  );
}

async function ThankYouPageContent({ params, searchParams }: ThankYouPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const rawOrderId = Array.isArray(query.orderId) ? query.orderId[0] : query.orderId;
  const rawToken = Array.isArray(query.token) ? query.token[0] : query.token;
  const orderId = Number.parseInt(rawOrderId ?? '', 10);
  const validOrderId = Number.isInteger(orderId) && orderId > 0 ? orderId : null;
  const validToken = rawToken?.trim() || null;
  const [t, contact, initialOrder] = await Promise.all([
    getTranslations({ locale, namespace: 'ThankYou' }),
    getStorefrontSettings().catch(() => defaultStorefrontSettingsResponse),
    validToken ? fetchStorefrontOrderByToken(validToken).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <PageShell locale={locale}>
      <ThankYouConfirmation
        locale={locale}
        orderId={initialOrder?.id ?? validOrderId}
        token={validToken}
        initialConfirmation={
          initialOrder
            ? {
                order: initialOrder,
                cartMode: 'cart',
                stateName: null,
                createdAt: initialOrder.updatedAt,
                purchaseEventId: initialOrder.purchaseEventId,
              }
            : null
        }
        labels={{
          verifying: t('verifying'),
          title: t('title'),
          description: t('description'),
          orderNumber: t('orderNumber'),
          nextTitle: t('nextTitle'),
          nextOne: t('nextOne'),
          nextTwo: t('nextTwo'),
          nextThree: t('nextThree'),
          summary: t('summary'),
          quantity: t('quantity'),
          subtotal: t('subtotal'),
          delivery: t('delivery'),
          total: t('total'),
          customer: t('customer'),
          phone: t('phone'),
          wilaya: t('wilaya'),
          commune: t('commune'),
          address: t('address'),
          deliveryMode: t('deliveryMode'),
          homeDelivery: t('homeDelivery'),
          officeDelivery: t('officeDelivery'),
          fallback: t('fallback'),
          unavailableTitle: t('unavailableTitle'),
          unavailableBody: t('unavailableBody'),
          retry: t('retry'),
          browseProducts: t('browseProducts'),
          trackingTitle: t('trackingTitle'),
          trackingLive: t('trackingLive'),
          trackingWaiting: t('trackingWaiting'),
          trackingPreparing: t('trackingPreparing'),
          trackingOnWay: t('trackingOnWay'),
          trackingDelivered: t('trackingDelivered'),
          trackingDelayed: t('trackingDelayed'),
          trackingCancelled: t('trackingCancelled'),
          trackingReturned: t('trackingReturned'),
          trackingFailed: t('trackingFailed'),
        }}
        support={{
          contact,
          labels: {
            title: t('supportTitle'),
            description: t('supportDescription'),
            call: t('supportCall'),
          },
        }}
      />
    </PageShell>
  );
}
