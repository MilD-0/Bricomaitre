import { LandingPageIndex } from '../../../../../components/assets/landing-page-index';
import { listLandingPageSummaries } from '../../../../../lib/landing-pages';
import { requireAssetsPageAccess } from '../../../../../lib/page-access';
import { getStorefrontPublicBaseUrl } from '../../../../../lib/storefront-public-url';

export default async function LandingPagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAssetsPageAccess(locale);
  return (
    <LandingPageIndex
      initialItems={await listLandingPageSummaries()}
      storefrontBaseUrl={getStorefrontPublicBaseUrl()}
    />
  );
}
