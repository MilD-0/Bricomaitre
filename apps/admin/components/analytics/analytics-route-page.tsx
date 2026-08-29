import { notFound } from 'next/navigation';

import { hasDb } from '@bric/db/client';

import { analyticsQuerySchema, getAnalyticsData, type AnalyticsView } from '../../lib/analytics';
import { requireStatsPageAccess } from '../../lib/page-access';
import { StatsWorkspace } from './analytics-workspace';

export type StatsRouteSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function StatsRoutePage({
  locale,
  searchParams,
  view,
}: {
  locale: string;
  searchParams?: Promise<StatsRouteSearchParams>;
  view: AnalyticsView;
}) {
  await requireStatsPageAccess(locale);
  if (!hasDb()) notFound();

  const query = (await searchParams) ?? {};
  const parsed = analyticsQuerySchema.safeParse({
    view,
    range: first(query.range),
    startDate: first(query.startDate),
    endDate: first(query.endDate),
    grain: first(query.grain),
  });
  const initialData = await getAnalyticsData(
    parsed.success ? parsed.data : { view, range: '30d', grain: 'auto' },
  );

  return <StatsWorkspace initialData={initialData} />;
}
