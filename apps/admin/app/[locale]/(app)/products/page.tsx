import { getTranslations } from 'next-intl/server';

import { ProductsManager } from '../../../../components/products-manager';
import { requireProductsPageAccess } from '../../../../lib/page-access';
import { canExportAllProducts } from '../../../../lib/permissions';

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await getTranslations();
  const session = await requireProductsPageAccess(locale);

  return <ProductsManager initialCanExportAll={canExportAllProducts(session?.user?.role)} />;
}
