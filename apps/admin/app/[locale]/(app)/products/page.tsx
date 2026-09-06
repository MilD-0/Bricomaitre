import { ProductsWorkspace } from '../../../../components/products/products-workspace';
import { requirePageAccess } from '../../../../lib/page-access';

export default async function ProductsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePageAccess(locale, 'products');
  return <ProductsWorkspace />;
}
