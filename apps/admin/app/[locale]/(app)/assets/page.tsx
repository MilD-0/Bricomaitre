import { AssetsManager } from '../../../../components/assets-manager';
import { loadAssetsData, loadAssetsMetaData } from '../../../../lib/admin-assets-data';
import { requireAssetsPageAccess } from '../../../../lib/page-access';

export default async function AssetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireAssetsPageAccess(locale);
  const [initialAssets, initialMeta] = await Promise.all([loadAssetsData(), loadAssetsMetaData()]);

  return <AssetsManager initialAssets={initialAssets} initialMeta={initialMeta} />;
}
