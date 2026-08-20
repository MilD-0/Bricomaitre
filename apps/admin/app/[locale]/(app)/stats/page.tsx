import { getTranslations } from 'next-intl/server';

import { StatsDashboard } from '../../../../components/stats/stats-dashboard';
import { hasDb } from '@bric/db/client';
import { requireStatsPageAccess } from '../../../../lib/page-access';
import { getAnalyticsSectionData } from '../../../../lib/stats-sections';

export default async function StatsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStatsPageAccess(locale);
  const [t, initialData] = await Promise.all([
    getTranslations(),
    hasDb() ? getAnalyticsSectionData('overview', { range: '30d' }) : Promise.resolve(null),
  ]);

  return (
    <StatsDashboard
      title={t('nav.stats')}
      description={t('pages.stats')}
      section="overview"
      initialData={initialData}
    />
  );
}
