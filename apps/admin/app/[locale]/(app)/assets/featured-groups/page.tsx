import { redirect } from 'next/navigation';

import { AssetsWorkspacePage } from '../../../../../components/assets/assets-workspace-page';
import { readLegacyUiPreference } from '../../../../../lib/admin-ui-preference.server';

export default async function FeaturedGroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (await readLegacyUiPreference()) redirect(`/${locale}/assets#featured-groups`);
  return <AssetsWorkspacePage locale={locale} view="groups" />;
}
