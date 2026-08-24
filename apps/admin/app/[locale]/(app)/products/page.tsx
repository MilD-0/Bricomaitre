import { ProductsWorkspace } from '../../../../components/products/products-workspace';
import { requireProductsPageAccess } from '../../../../lib/page-access';

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireProductsPageAccess(locale);
  return <ProductsWorkspace />;
}
