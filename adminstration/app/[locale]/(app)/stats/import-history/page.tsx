import { getTranslations } from 'next-intl/server';

import { StatsDashboard } from '../../../../../components/stats-dashboard';
import { requireStatsPageAccess } from '../../../../../lib/page-access';

export default async function StatsImportHistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireStatsPageAccess(locale);
  const t = await getTranslations();
  return <StatsDashboard title={t('statsDashboard.imports.title')} description={t('pages.stats')} section="imports" />;
}
