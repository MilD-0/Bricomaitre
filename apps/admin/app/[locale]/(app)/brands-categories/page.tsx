import { redirect } from 'next/navigation';
import { requireBrandsCategoriesPageAccess } from '../../../../lib/page-access';

export default async function BrandsCategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireBrandsCategoriesPageAccess(locale);
  redirect(`/${locale}/brands`);
}
