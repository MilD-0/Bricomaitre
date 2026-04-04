import { getTranslations } from 'next-intl/server';

import { StatsDashboard } from '../../../../components/stats-dashboard';
import { hasDb } from '../../../../db/client';
import { requireStatsPageAccess } from '../../../../lib/page-access';
import { getStatsDashboard } from '../../../../lib/stats';

export default async function StatsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireStatsPageAccess(locale);
  const [t, initialData] = await Promise.all([
    getTranslations(),
    hasDb() ? getStatsDashboard({ range: '90d' }) : Promise.resolve(null),
  ]);

  return <StatsDashboard title={t('nav.stats')} description={t('pages.stats')} section="overview" initialData={initialData} />;
}
