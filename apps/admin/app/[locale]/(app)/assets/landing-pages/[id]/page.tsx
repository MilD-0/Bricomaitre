import { notFound, redirect } from 'next/navigation';

import { LandingPageBuilder } from '../../../../../../components/assets/landing-page-builder';
import { readLegacyUiPreference } from '../../../../../../lib/admin-ui-preference.server';
import {
  getLandingPageDetail,
  LandingPageNotFoundError,
} from '../../../../../../lib/landing-pages';
import { requireAssetsPageAccess } from '../../../../../../lib/page-access';
import { getStorefrontBaseUrl } from '../../../../../../lib/storefront-revalidate';

export default async function LandingPageBuilderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (await readLegacyUiPreference()) redirect(`/${locale}/landing-pages`);
  await requireAssetsPageAccess(locale);
  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) notFound();
  let initialPage;
  try {
    initialPage = await getLandingPageDetail(numericId);
  } catch (error) {
    if (error instanceof LandingPageNotFoundError) notFound();
    throw error;
  }
  return (
    <LandingPageBuilder initialPage={initialPage} storefrontBaseUrl={getStorefrontBaseUrl()} />
  );
}
