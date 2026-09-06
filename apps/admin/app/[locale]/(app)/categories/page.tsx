import { getTranslations } from 'next-intl/server';

import { TaxonomyWorkspace } from '../../../../components/brands-categories/taxonomy-workspace';
import { requirePageAccess } from '../../../../lib/page-access';

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requirePageAccess(locale, 'brandsCategories');
  await getTranslations();
  return <TaxonomyWorkspace view="categories" />;
}
