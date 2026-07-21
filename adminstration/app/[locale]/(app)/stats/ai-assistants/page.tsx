import { getTranslations } from 'next-intl/server';

import { StatsDashboard } from '../../../../../components/stats-dashboard';
import { requireStatsPageAccess } from '../../../../../lib/page-access';

export default async function StatsAiAssistantsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  await requireStatsPageAccess(locale);
  const t = await getTranslations();
  return <StatsDashboard title={t('statsDashboard.tabs.aiAssistants')} description={t('pages.stats')} section="aiAssistants" />;
}
