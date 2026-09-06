import { notFound } from 'next/navigation';

import { hasDb } from '@bric/db/client';

import { aiStatsQuerySchema, getAiStatsData, type AiStatsSurface } from '../../lib/ai-stats';
import { requirePageAccess } from '../../lib/page-access';
import { AiStatsWorkspace } from './ai-stats-workspace';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function AiStatsRoutePage({
  locale,
  searchParams,
  surface,
}: {
  locale: string;
  searchParams?: Promise<SearchParams>;
  surface: AiStatsSurface;
}) {
  await requirePageAccess(locale, 'stats');
  if (!hasDb()) notFound();

  const query = (await searchParams) ?? {};
  const parsed = aiStatsQuerySchema.safeParse({
    surface,
    range: first(query.range),
    startDate: first(query.startDate),
    endDate: first(query.endDate),
    grain: first(query.grain),
  });
  const initialData = await getAiStatsData(
    parsed.success ? parsed.data : { surface, range: '30d', grain: 'auto' },
  );

  return <AiStatsWorkspace initialData={initialData} />;
}
