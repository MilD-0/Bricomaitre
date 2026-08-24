import { AssetsWorkspacePage } from '../../../../components/assets/assets-workspace-page';

export default async function AssetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <AssetsWorkspacePage locale={locale} view="banners" />;
}
