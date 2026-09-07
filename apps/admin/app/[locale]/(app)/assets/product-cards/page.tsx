import { AssetsWorkspacePage } from '@/components/assets/assets-workspace-page';

export default async function ProductCardsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AssetsWorkspacePage locale={locale} view="cards" />;
}
