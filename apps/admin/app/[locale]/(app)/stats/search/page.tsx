import { redirect } from 'next/navigation';

import { StatsRoutePage } from '../../../../../components/analytics2/analytics2-route-page';
import { localizedStatsUrl } from '../../../../../lib/analytics2-routes';
import { readLegacyUiPreference } from '../../../../../lib/admin-ui-preference.server';
import { requireStatsPageAccess } from '../../../../../lib/page-access';

export default async function StatsSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (await readLegacyUiPreference()) {
    await requireStatsPageAccess(locale);
    redirect(localizedStatsUrl(locale, 'command', query));
  }
  return <StatsRoutePage locale={locale} searchParams={Promise.resolve(query)} view="search" />;
}
