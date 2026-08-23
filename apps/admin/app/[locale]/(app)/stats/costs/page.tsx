import { getTranslations } from 'next-intl/server';

import { hasDb } from '@bric/db/client';
import { StatsRoutePage } from '../../../../../components/analytics2/analytics2-route-page';
import { ProfitTrackerDashboard } from '../../../../../components/stats/profit-tracker-dashboard';
import { readLegacyUiPreference } from '../../../../../lib/admin-ui-preference.server';
import { requireStatsPageAccess } from '../../../../../lib/page-access';
import { getProfitTrackerReport } from '../../../../../lib/profit-tracker';

export default async function CostsAndAssumptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!(await readLegacyUiPreference())) {
    return <StatsRoutePage locale={locale} searchParams={searchParams} view="assumptions" />;
  }
  await requireStatsPageAccess(locale);
  const [t, initialData] = await Promise.all([
    getTranslations(),
    hasDb() ? getProfitTrackerReport({ range: '30d' }) : Promise.resolve(null),
  ]);

  return (
    <ProfitTrackerDashboard
      title={t('statsDashboard.costsPage.title')}
      description={t('statsDashboard.costsPage.description')}
      initialData={initialData}
      surface="costs"
    />
  );
}
