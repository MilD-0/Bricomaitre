import { notFound } from 'next/navigation';

import { LandingPageBuilder } from '../../../../../../components/assets/landing-page-builder';
import {
  getLandingPageDetail,
  LandingPageNotFoundError,
} from '../../../../../../lib/landing-pages';
import { requireAssetsPageAccess } from '../../../../../../lib/page-access';
import { getStorefrontPublicBaseUrl } from '../../../../../../lib/storefront-public-url';

export default async function LandingPageBuilderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
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
    <LandingPageBuilder
      key={initialPage.id}
      initialPage={initialPage}
      storefrontBaseUrl={getStorefrontPublicBaseUrl()}
    />
  );
}
