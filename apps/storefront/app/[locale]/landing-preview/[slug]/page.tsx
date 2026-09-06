import { LandingOrderProvider } from '@/components/landing-order-context';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import '../../../styles/product.css';
import '../../../styles/checkout.css';
import '../../../styles/landing-page.css';

import { LandingPageRenderer } from '@/components/landing-page-renderer';
import { LandingOrderForm } from '@/components/landing-order-form';
import { PageShell } from '@/components/page-shell';
import { isLocale } from '@/i18n/config';
import {
  parseLandingPagePreviewSearchParams,
  type LandingPagePreviewSearchParams,
} from '@/lib/landing-page-preview';
import { getStorefrontLandingPage } from '@/lib/storefront-api';

type LandingPagePreviewProps = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<LandingPagePreviewSearchParams>;
};

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function LandingPagePreview({
  params,
  searchParams,
}: LandingPagePreviewProps) {
  const [{ locale, slug }, previewQuery, requestHeaders] = await Promise.all([
    params,
    searchParams,
    headers(),
  ]);
  if (!isLocale(locale)) notFound();
  const { preview } = parseLandingPagePreviewSearchParams(previewQuery);
  if (!preview) notFound();
  const page = await getStorefrontLandingPage(locale, slug, preview).catch(() => null);
  if (!page) notFound();

  return (
    <PageShell locale={locale}>
      <aside className="landing-preview-banner" role="status">
        {locale === 'ar'
          ? 'معاينة آمنة للنسخة المحفوظة. إرسال النموذج سينشئ طلباً حقيقياً.'
          : 'Aperçu sécurisé de la version enregistrée. Envoyer le formulaire créera une vraie commande.'}
      </aside>
      <LandingOrderProvider key={page.id} productId={page.product.id}>
        <LandingPageRenderer
          page={page}
          locale={locale}
          nonce={requestHeaders.get('x-nonce') ?? undefined}
        />
        <LandingOrderForm page={page} locale={locale} />
      </LandingOrderProvider>
    </PageShell>
  );
}
