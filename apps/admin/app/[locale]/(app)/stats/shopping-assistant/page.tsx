import { AiStatsRoutePage } from '../../../../../components/analytics/ai-stats-route-page';

export default async function StatsShoppingAssistantPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  return <AiStatsRoutePage locale={locale} searchParams={searchParams} surface="shopping" />;
}
