import { AssetsManager } from '../../../../components/assets-manager';
import { AssetsWorkspacePage } from '../../../../components/assets/assets-workspace-page';
import { loadAssetsData, loadAssetsMetaData } from '../../../../lib/admin-assets-data';
import { readLegacyUiPreference } from '../../../../lib/admin-ui-preference.server';
import { requireAssetsPageAccess } from '../../../../lib/page-access';

export default async function AssetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await readLegacyUiPreference())) {
    return <AssetsWorkspacePage locale={locale} view="banners" />;
  }
  await requireAssetsPageAccess(locale);
  const [initialAssets, initialMeta] = await Promise.all([loadAssetsData(), loadAssetsMetaData()]);

  return <AssetsManager initialAssets={initialAssets} initialMeta={initialMeta} />;
}
