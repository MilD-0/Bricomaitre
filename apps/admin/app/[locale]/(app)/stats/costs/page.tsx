import { getTranslations } from 'next-intl/server';

import { hasDb } from '@bric/db/client';
import { ProfitTrackerDashboard } from '../../../../../components/stats/profit-tracker-dashboard';
import { requireStatsPageAccess } from '../../../../../lib/page-access';
import { getProfitTrackerReport } from '../../../../../lib/profit-tracker';

export default async function CostsAndAssumptionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
