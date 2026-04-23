import { getTranslations } from 'next-intl/server';

import { PaidClicksDashboard } from '../../../../../components/paid-clicks-dashboard';
import { requireAdministrationPageAccess } from '../../../../../lib/page-access';

export default async function StatsPaidClicksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdministrationPageAccess(locale);
  const t = await getTranslations();

  return <PaidClicksDashboard title={t('statsDashboard.tabs.paidClicks')} description={t('pages.stats')} />;
}
