import { StatsRoutePage } from '@/components/analytics/analytics-route-page';

export default async function StatsFulfillmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return (
    <StatsRoutePage locale={locale} searchParams={Promise.resolve(query)} view="fulfillment" />
  );
}
