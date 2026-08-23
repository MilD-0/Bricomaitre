import { getTranslations } from 'next-intl/server';

import { StatsDashboard } from '../../../../components/stats/stats-dashboard';
import { StatsRoutePage } from '../../../../components/analytics2/analytics2-route-page';
import { hasDb } from '@bric/db/client';
import { readLegacyUiPreference } from '../../../../lib/admin-ui-preference.server';
import { requireStatsPageAccess } from '../../../../lib/page-access';
import { getAnalyticsSectionData } from '../../../../lib/stats-sections';

export default async function StatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!(await readLegacyUiPreference())) {
    return <StatsRoutePage locale={locale} searchParams={searchParams} view="command" />;
  }
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
