import { redirect } from 'next/navigation';

import { requireStatsPageAccess } from '../../../../../lib/page-access';

export default async function StatsPaidClicksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireStatsPageAccess(locale);
  redirect(`/${locale}/stats/meta-ads`);
}
