import {
  defaultStorefrontSettingsResponse,
  type StorefrontHomepageResponse,
} from '@bric/storefront-core/contracts';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { Homepage } from '@/components/homepage';
import { PageShell } from '@/components/page-shell';
import { StructuredData } from '@/components/structured-data';
import { isLocale } from '@/i18n/config';
import { buildHomepageStructuredData } from '@/lib/homepage-seo';
import { getStorefrontHomepage, getStorefrontSettings } from '@/lib/storefront-api';

export type HomePageProps = { params: Promise<{ locale: string }> };

const emptyHomepage: StorefrontHomepageResponse = {
  banners: [],
  topProducts: [],
  categories: [],
  productCards: [],
  brands: [],
  featuredGroups: [],
};

export async function HomePageContent({ params }: HomePageProps) {
  const [{ locale }, requestHeaders] = await Promise.all([params, headers()]);
  if (!isLocale(locale)) notFound();
  const [data, contact] = await Promise.all([
    getStorefrontHomepage().catch(() => emptyHomepage),
    getStorefrontSettings().catch(() => defaultStorefrontSettingsResponse),
  ]);

  return (
    <PageShell locale={locale} contactSettings={contact}>
      <StructuredData
        value={buildHomepageStructuredData(locale)}
        nonce={requestHeaders.get('x-nonce') ?? undefined}
      />
      <Homepage data={data} locale={locale} contact={contact} />
    </PageShell>
  );
}
