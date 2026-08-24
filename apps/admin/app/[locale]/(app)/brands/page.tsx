import { getTranslations } from 'next-intl/server';

import { TaxonomyWorkspace } from '../../../../components/brands-categories/taxonomy-workspace';
import { requireBrandsCategoriesPageAccess } from '../../../../lib/page-access';

export default async function BrandsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireBrandsCategoriesPageAccess(locale);
  await getTranslations();
  return <TaxonomyWorkspace view="brands" />;
}
