import { getTranslations } from 'next-intl/server';

import { StatsDashboard } from '../../../../../components/stats/stats-dashboard';
import { redirectModernStatsAlias } from '../../../../../lib/analytics2-routes.server';

export default async function StatsManualOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  await redirectModernStatsAlias({ locale, searchParams, view: 'assumptions' });
  const t = await getTranslations();
  return (
    <StatsDashboard
      title={t('statsDashboard.manualOrders.sectionTitle')}
      description={t('pages.stats')}
      section="manualOrders"
    />
  );
}
