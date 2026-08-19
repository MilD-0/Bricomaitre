import { getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';

import { ProductsManager } from '../../../../components/products-manager';
import { ProductsWorkspace } from '../../../../components/products/products-workspace';
import {
  ADMIN_LEGACY_UI_COOKIE,
  parseLegacyUiPreference,
} from '../../../../lib/admin-ui-preference';
import { requireProductsPageAccess } from '../../../../lib/page-access';
import { canExportAllProducts } from '../../../../lib/permissions';

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await getTranslations();
  const session = await requireProductsPageAccess(locale);
  const cookieStore = await cookies();
  const legacyUi = parseLegacyUiPreference(cookieStore.get(ADMIN_LEGACY_UI_COOKIE)?.value);

  return legacyUi ? (
    <ProductsManager initialCanExportAll={canExportAllProducts(session?.user?.role)} />
  ) : (
    <ProductsWorkspace />
  );
}
