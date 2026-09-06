import { ProductsWorkspace } from '../../../../components/products/products-workspace';
import { canExportAllProducts } from '../../../../lib/permissions';
import { requirePageAccess } from '../../../../lib/page-access';

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const session = await requirePageAccess(locale, 'products');
  return <ProductsWorkspace canExportAll={canExportAllProducts(session.user.role)} />;
}
