import { getTranslations } from 'next-intl/server';

import { CategoriesManager } from '../../../../components/brands-categories/categories-manager';
import { requireBrandsCategoriesPageAccess } from '../../../../lib/page-access';

export default async function CategoriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireBrandsCategoriesPageAccess(locale);
  await getTranslations();
  return <CategoriesManager />;
}
