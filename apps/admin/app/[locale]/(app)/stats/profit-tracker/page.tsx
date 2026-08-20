import { redirect } from 'next/navigation';

import { requireStatsPageAccess } from '../../../../../lib/page-access';

export default async function LegacyProfitTrackerPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  await requireStatsPageAccess(locale);
  const source = await searchParams;
  const target = new URLSearchParams();
  for (const key of ['range', 'startDate', 'endDate']) {
    const value = source[key];
    if (typeof value === 'string') target.set(key, value);
  }
  redirect(`/${locale}/stats/time${target.size ? `?${target.toString()}` : ''}`);
}
