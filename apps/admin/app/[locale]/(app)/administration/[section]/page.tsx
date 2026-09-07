import { AdministrationPage } from '@/components/administration/administration-page';

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; section: string }>;
}) {
  const { locale, section } = await params;
  return <AdministrationPage locale={locale} section={section} />;
}
