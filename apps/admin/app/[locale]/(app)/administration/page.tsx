import { AdministrationPage as AdministrationWorkspacePage } from '@/components/administration/administration-page';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AdministrationWorkspacePage locale={locale} />;
}
