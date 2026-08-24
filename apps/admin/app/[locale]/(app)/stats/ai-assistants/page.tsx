import { getTranslations } from 'next-intl/server';

import { AiStatsRoutePage } from '../../../../../components/analytics2/ai-stats-route-page';
import { StatsDashboard } from '../../../../../components/stats/stats-dashboard';
import { readLegacyUiPreference } from '../../../../../lib/admin-ui-preference.server';

export default async function StatsAiAssistantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!(await readLegacyUiPreference())) {
    return <AiStatsRoutePage locale={locale} searchParams={searchParams} surface="operations" />;
  }
  const t = await getTranslations();
  return (
    <StatsDashboard
      title={t('statsDashboard.tabs.aiAssistants')}
      description={t('pages.stats')}
      section="aiAssistants"
    />
  );
}
