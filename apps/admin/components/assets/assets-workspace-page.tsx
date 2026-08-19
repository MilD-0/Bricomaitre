import {
  loadAssetsData,
  loadAssetsTaxonomyData,
  searchAssetProductOptions,
} from '../../lib/admin-assets-data';
import { requireAssetsPageAccess } from '../../lib/page-access';
import { AssetsWorkspace, type AssetsWorkspaceView } from './assets-workspace';

export async function AssetsWorkspacePage({
  locale,
  view,
}: {
  locale: string;
  view: AssetsWorkspaceView;
}) {
  await requireAssetsPageAccess(locale);
  const [assets, taxonomy] = await Promise.all([loadAssetsData(), loadAssetsTaxonomyData()]);
  const productIds = [
    ...new Set([
      ...assets.banners.flatMap((item) => item.productId ?? []),
      ...assets.productCards.map((item) => item.productId),
      ...assets.featuredGroups.flatMap((item) => item.productIds),
    ]),
  ];
  const products = await searchAssetProductOptions({
    search: '',
    ids: productIds,
    page: 1,
    limit: Math.max(1, productIds.length),
  });

  return (
    <AssetsWorkspace
      view={view}
      initialAssets={assets}
      taxonomy={taxonomy}
      initialProducts={products.items}
    />
  );
}
