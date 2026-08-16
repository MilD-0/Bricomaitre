import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CheckoutPageContent, type CheckoutPageProps } from './page-content';
import { CheckoutPageSkeleton } from '@/components/storefront-skeletons';

export async function generateMetadata({
  params,
}: Pick<CheckoutPageProps, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const arabic = locale === 'ar';

  return {
    title: arabic ? 'إتمام الطلب' : 'Finaliser votre commande',
    description: arabic
      ? 'أكمل طلبك بخطوات بسيطة مع الدفع عند الاستلام.'
      : 'Finalisez votre commande Bricomaitre en quelques étapes, avec paiement à la livraison.',
    robots: { index: false, follow: false },
  };
}

export default function CheckoutPage(props: CheckoutPageProps) {
  return (
    <Suspense fallback={<CheckoutPageSkeleton />}>
      <CheckoutPageContent {...props} />
    </Suspense>
  );
}
