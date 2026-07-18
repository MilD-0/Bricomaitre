import { LandingPageManager } from '../../../../components/landing-page-manager';
import { loadAssetsMetaData } from '../../../../lib/admin-assets-data';
import { listLandingPages } from '../../../../lib/landing-pages';
import { requireAssetsPageAccess } from '../../../../lib/page-access';
import { getStorefrontNewBaseUrl } from '../../../../lib/storefront-revalidate';

export default async function LandingPagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAssetsPageAccess(locale);
  const [items, meta] = await Promise.all([listLandingPages(), loadAssetsMetaData()]);
  return <LandingPageManager initialItems={items} products={meta.products} storefrontBaseUrl={getStorefrontNewBaseUrl()} />;
}
