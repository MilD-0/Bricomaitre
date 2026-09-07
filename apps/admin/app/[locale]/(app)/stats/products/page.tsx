import { StatsRoutePage } from '@/components/analytics/analytics-route-page';

export default async function StatsProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  return <StatsRoutePage locale={locale} searchParams={searchParams} view="catalog" />;
}
