import { redirect } from 'next/navigation';

import { LandingPageIndex } from '../../../../../components/assets/landing-page-index';
import { readLegacyUiPreference } from '../../../../../lib/admin-ui-preference.server';
import { listLandingPageSummaries } from '../../../../../lib/landing-pages';
import { requireAssetsPageAccess } from '../../../../../lib/page-access';
import { getStorefrontBaseUrl } from '../../../../../lib/storefront-revalidate';

export default async function LandingPagesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (await readLegacyUiPreference()) redirect(`/${locale}/landing-pages`);
  await requireAssetsPageAccess(locale);
  return (
    <LandingPageIndex
      initialItems={await listLandingPageSummaries()}
      storefrontBaseUrl={getStorefrontBaseUrl()}
    />
  );
}
