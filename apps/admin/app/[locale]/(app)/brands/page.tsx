import { getTranslations } from 'next-intl/server';

import { BrandsManager } from '../../../../components/brands-categories-manager';
import { requireBrandsCategoriesPageAccess } from '../../../../lib/page-access';

export default async function BrandsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireBrandsCategoriesPageAccess(locale);
  await getTranslations();
  return <BrandsManager />;
}
