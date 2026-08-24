import { StatsRoutePage } from '../../../../../components/analytics2/analytics2-route-page';

export default async function StatsSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  return <StatsRoutePage locale={locale} searchParams={Promise.resolve(query)} view="search" />;
}
