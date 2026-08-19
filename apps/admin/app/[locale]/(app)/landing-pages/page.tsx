import { LandingPageManager } from '../../../../components/landing-page-manager';
import { readLegacyUiPreference } from '../../../../lib/admin-ui-preference.server';
import { loadAssetsMetaData } from '../../../../lib/admin-assets-data';
import { listLandingPages } from '../../../../lib/landing-pages';
import { requireAssetsPageAccess } from '../../../../lib/page-access';
import { getStorefrontBaseUrl } from '../../../../lib/storefront-revalidate';
import { redirect } from 'next/navigation';

export default async function LandingPagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(await readLegacyUiPreference())) redirect(`/${locale}/assets/landing-pages`);
  await requireAssetsPageAccess(locale);
  const [items, meta] = await Promise.all([listLandingPages(), loadAssetsMetaData()]);
  return (
    <LandingPageManager
      initialItems={items}
      products={meta.products}
      storefrontBaseUrl={getStorefrontBaseUrl()}
    />
  );
}
