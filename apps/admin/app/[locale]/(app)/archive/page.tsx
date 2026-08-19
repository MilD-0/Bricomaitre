import { getDb, hasDb } from '@bric/db/client';

import { ProductArchive } from '../../../../components/products/product-archive';
import { loadArchivedProducts } from '../../../../lib/product-archive';
import { requireProductsPageAccess } from '../../../../lib/page-access';

export default async function ProductArchivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireProductsPageAccess(locale);
  return <ProductArchive initialProducts={hasDb() ? await loadArchivedProducts(getDb()) : []} />;
}
