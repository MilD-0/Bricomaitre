import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PageShell } from '@/components/page-shell';
import { ThankYouConfirmation } from '@/components/thank-you-confirmation';
import { isLocale } from '@/i18n/config';

export const metadata: Metadata = {
  title: 'Order confirmation',
  robots: { index: false, follow: false },
};

type ThankYouPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ThankYouPage(props: ThankYouPageProps) {
  return <Suspense fallback={<div className="thank-you-loading" aria-busy="true" />}><ThankYouPageContent {...props} /></Suspense>;
}

export async function ThankYouPageContent({ params, searchParams }: ThankYouPageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({ locale, namespace: 'ThankYou' });
  const rawOrderId = Array.isArray(query.orderId) ? query.orderId[0] : query.orderId;
  const rawToken = Array.isArray(query.token) ? query.token[0] : query.token;
  const orderId = Number.parseInt(rawOrderId ?? '', 10);

  return (
    <PageShell locale={locale}>
      <ThankYouConfirmation
        locale={locale}
        orderId={Number.isInteger(orderId) && orderId > 0 ? orderId : null}
        token={rawToken?.trim() || null}
        labels={{
          verifying: t('verifying'), title: t('title'), description: t('description'), orderNumber: t('orderNumber'),
          nextTitle: t('nextTitle'), nextOne: t('nextOne'), nextTwo: t('nextTwo'), nextThree: t('nextThree'),
          summary: t('summary'), quantity: t('quantity'), subtotal: t('subtotal'), delivery: t('delivery'), total: t('total'),
          customer: t('customer'), phone: t('phone'), wilaya: t('wilaya'), commune: t('commune'), address: t('address'), deliveryMode: t('deliveryMode'),
          homeDelivery: t('homeDelivery'), officeDelivery: t('officeDelivery'), fallback: t('fallback'), unavailableTitle: t('unavailableTitle'),
          unavailableBody: t('unavailableBody'), retry: t('retry'), browseProducts: t('browseProducts'),
        }}
      />
    </PageShell>
  );
}
