import {
  defaultStorefrontSettingsResponse,
  type StorefrontHomepageResponse,
} from '@bric/storefront-core/contracts';
import { notFound } from 'next/navigation';

import { Homepage } from '@/components/homepage';
import { PageShell } from '@/components/page-shell';
import { isLocale } from '@/i18n/config';
import { buildHomepageStructuredData } from '@/lib/homepage-seo';
import { serializeStructuredData } from '@/lib/product-seo';
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
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const [data, contact] = await Promise.all([
    getStorefrontHomepage().catch(() => emptyHomepage),
    getStorefrontSettings().catch(() => defaultStorefrontSettingsResponse),
  ]);

  return (
    <PageShell locale={locale} contactSettings={contact}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeStructuredData(buildHomepageStructuredData(locale)),
        }}
      />
      <Homepage data={data} locale={locale} contact={contact} />
    </PageShell>
  );
}
