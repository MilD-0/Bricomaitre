import { redirect } from 'next/navigation';

import { AssetsWorkspacePage } from '../../../../../components/assets/assets-workspace-page';
import { readLegacyUiPreference } from '../../../../../lib/admin-ui-preference.server';

export default async function ProductCardsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (await readLegacyUiPreference()) redirect(`/${locale}/assets#product-cards`);
  return <AssetsWorkspacePage locale={locale} view="cards" />;
}
