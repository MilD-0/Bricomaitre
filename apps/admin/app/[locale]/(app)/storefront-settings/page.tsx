import { StorefrontSettingsForm } from '../../../../components/settings/storefront-settings-form';
import { requireStorefrontSettingsPageAccess } from '../../../../lib/page-access';
import { loadStorefrontSettings } from '../../../../lib/storefront-settings';

export default async function StorefrontSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireStorefrontSettingsPageAccess(locale);
  const settings = await loadStorefrontSettings();

  return <StorefrontSettingsForm initialSettings={settings} />;
}
