import { getTranslations } from 'next-intl/server';

import { CategoriesManager } from '../../../../components/brands-categories/categories-manager';
import { TaxonomyWorkspace } from '../../../../components/brands-categories/taxonomy-workspace';
import { readLegacyUiPreference } from '../../../../lib/admin-ui-preference.server';
import { requireBrandsCategoriesPageAccess } from '../../../../lib/page-access';

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireBrandsCategoriesPageAccess(locale);
  await getTranslations();
  const legacyUi = await readLegacyUiPreference();

  return legacyUi ? <CategoriesManager /> : <TaxonomyWorkspace view="categories" />;
}
