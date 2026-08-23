import { getTranslations } from 'next-intl/server';

import { StatsRoutePage } from '../../../../../components/analytics2/analytics2-route-page';
import { StatsDashboard } from '../../../../../components/stats/stats-dashboard';
import { readLegacyUiPreference } from '../../../../../lib/admin-ui-preference.server';
import { requireStatsPageAccess } from '../../../../../lib/page-access';

export default async function StatsMetaAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!(await readLegacyUiPreference())) {
    return <StatsRoutePage locale={locale} searchParams={searchParams} view="acquisition" />;
  }
  await requireStatsPageAccess(locale);
  const t = await getTranslations();
  return (
    <StatsDashboard
      title={t('statsDashboard.tabs.metaAds')}
      description={t('pages.stats')}
      section="metaAds"
    />
  );
}
