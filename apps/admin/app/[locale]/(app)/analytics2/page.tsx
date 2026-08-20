import { notFound } from 'next/navigation';

import { hasDb } from '@bric/db/client';

import { Analytics2Workspace } from '../../../../components/analytics2/analytics2-workspace';
import { analytics2QuerySchema, getAnalytics2Data } from '../../../../lib/analytics2';
import { requireStatsPageAccess } from '../../../../lib/page-access';

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Analytics2Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  await requireStatsPageAccess(locale);
  if (!hasDb()) notFound();

  const parsed = analytics2QuerySchema.safeParse({
    view: first(query.view),
    range: first(query.range),
    startDate: first(query.startDate),
    endDate: first(query.endDate),
    grain: first(query.grain),
  });
  const initialData = await getAnalytics2Data(
    parsed.success ? parsed.data : { view: 'command', range: '30d', grain: 'auto' },
  );

  return <Analytics2Workspace initialData={initialData} />;
}
