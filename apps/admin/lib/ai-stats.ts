import { sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  aiRuns,
  analyticsAiDailyRollups,
  analyticsEvents,
  orderAiInfluence,
} from '@bric/db/schema';
import { STOREFRONT_ANALYTICS_PROJECT } from '@bric/storefront-core/contracts';
import {
  ISO_DATE_PATTERN,
  aiStatsQuerySchema,
  isoValue,
  numberValue,
  rows,
  timestampCondition,
  type AiStatsFilters,
  type AiStatsPayload,
  type AiStatsQuery,
  type AiStatsSurface,
  type Database,
} from './ai-stats-contract';
import { loadOperations } from './ai-stats-operations';
import { loadShopping } from './ai-stats-shopping';
import { resolveAnalyticsFilters, resolveAnalyticsReferenceNow } from './analytics';

export { aiStatsQuerySchema } from './ai-stats-contract';
export type {
  AiOperationsStats,
  AiShoppingStats,
  AiStatsMetric,
  AiStatsPayload,
  AiStatsQuery,
  AiStatsRange,
  AiStatsSurface,
} from './ai-stats-contract';

async function loadAiDatasetCutoff(db: Database, surface: AiStatsSurface) {
  const result =
    surface === 'operations'
      ? await db.execute(sql`
          select to_char(max(${aiRuns.startedAt} at time zone 'Africa/Algiers'), 'YYYY-MM-DD') as cutoff
          from ${aiRuns} where ${aiRuns.surface} = 'admin'
        `)
      : await db.execute(sql`
          select to_char(greatest(
            (select max(${analyticsAiDailyRollups.day}) from ${analyticsAiDailyRollups}),
            (select max(${analyticsEvents.occurredAt} at time zone 'Africa/Algiers')
              from ${analyticsEvents}
              where ${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}),
            (select max(${orderAiInfluence.capturedAt} at time zone 'Africa/Algiers')
              from ${orderAiInfluence})
          ), 'YYYY-MM-DD') as cutoff
        `);
  const value = rows(result)[0]?.cutoff;
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) ? value : null;
}

function resolveAiFilters(query: AiStatsQuery, now: Date): AiStatsFilters {
  const parsed = aiStatsQuerySchema.parse(query);
  const shared = resolveAnalyticsFilters(
    {
      view: 'command',
      range: parsed.range,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      grain: parsed.grain,
    },
    now,
  );
  return {
    surface: parsed.surface,
    range: shared.range,
    startDate: shared.startDate,
    endDate: shared.endDate,
    grain: shared.grain,
    resolvedGrain: shared.resolvedGrain,
  };
}

export async function getAiStatsData(
  query: AiStatsQuery,
  options: { db?: Database; now?: Date } = {},
): Promise<AiStatsPayload> {
  const startedAt = performance.now();
  const db = options.db ?? getDb();
  const parsed = aiStatsQuerySchema.parse(query);
  const wallNow = options.now ?? new Date();
  const reviewSetting = options.now ? undefined : process.env.STATS_REVIEW_CLOCK;
  const cutoff = reviewSetting ? await loadAiDatasetCutoff(db, parsed.surface) : null;
  const clock = resolveAnalyticsReferenceNow(reviewSetting, cutoff, wallNow);
  const filters = resolveAiFilters(
    clock.reviewClock && parsed.range === 'custom' && parsed.endDate! > clock.referenceDate
      ? { ...parsed, endDate: clock.referenceDate }
      : parsed,
    clock.now,
  );
  const [data, coverageResult] = await Promise.all([
    filters.surface === 'operations' ? loadOperations(db, filters) : loadShopping(db, filters),
    filters.surface === 'operations'
      ? db.execute(sql`
          select min(${aiRuns.startedAt}) as from_at, max(${aiRuns.startedAt}) as through_at,
            count(*)::int as records
          from ${aiRuns} where ${aiRuns.surface} = 'admin' and ${timestampCondition(aiRuns.startedAt, filters)}
        `)
      : db.execute(sql`
          select min(${analyticsEvents.occurredAt}) as from_at,
            max(${analyticsEvents.occurredAt}) as through_at, count(*)::int as records
          from ${analyticsEvents}
          where ${timestampCondition(analyticsEvents.occurredAt, filters)}
            and ${analyticsEvents.metadata}->>'storefrontProject' = ${STOREFRONT_ANALYTICS_PROJECT}
            and ${analyticsEvents.eventName} like 'ai_assistant_%'
        `),
  ]);
  const coverage = rows(coverageResult)[0] ?? {};
  const base = {
    surface: filters.surface,
    filters,
    generatedAt: clock.now.toISOString(),
    referenceDate: clock.referenceDate,
    reviewClock: clock.reviewClock,
    coverage: {
      fromDate: isoValue(coverage.from_at)?.slice(0, 10) ?? null,
      throughDate: isoValue(coverage.through_at)?.slice(0, 10) ?? null,
      records: numberValue(coverage.records),
    },
    data,
    diagnostics: {
      queryDurationMs: Math.round(performance.now() - startedAt),
      responseSizeBytes: 0,
    },
  } satisfies AiStatsPayload;
  return {
    ...base,
    diagnostics: {
      ...base.diagnostics,
      responseSizeBytes: Buffer.byteLength(JSON.stringify(base)),
    },
  };
}
