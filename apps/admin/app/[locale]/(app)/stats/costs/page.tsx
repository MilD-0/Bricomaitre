import { StatsRoutePage } from '../../../../../components/analytics2/analytics2-route-page';

export default async function CostsAndAssumptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  return <StatsRoutePage locale={locale} searchParams={searchParams} view="assumptions" />;
}
