import 'server-only';

import { redirect } from 'next/navigation';

import type { Analytics2View } from './analytics2';
import { localizedStatsUrl } from './analytics2-routes';
import { readLegacyUiPreference } from './admin-ui-preference.server';
import { requireStatsPageAccess } from './page-access';

export async function redirectModernStatsAlias({
  locale,
  searchParams,
  view,
}: {
  locale: string;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  view: Analytics2View;
}) {
  await requireStatsPageAccess(locale);
  if (await readLegacyUiPreference()) return;
  const query = (await searchParams) ?? {};
  redirect(localizedStatsUrl(locale, view, query));
}
