import { sql, type SQLWrapper } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  searchConsoleDailyAppearances,
  searchConsoleDailyRows,
  searchConsoleDailyTotals,
  searchConsoleSitemaps,
  searchConsoleSyncRuns,
  searchConsoleUrlInspections,
} from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;

export type SearchAnalyticsFilters = {
  startDate: string | null;
  endDate: string;
  comparisonStartDate: string | null;
  comparisonEndDate: string | null;
  resolvedGrain: 'day' | 'week' | 'month';
};

type AggregateRow = {
  key: string;
  clicks: number;
  impressions: number;
  position: number | null;
  secondaryCount: number;
};

type QueryPageRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function iso(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function datePredicate(column: SQLWrapper, startDate: string | null, endDate: string) {
  return sql`${startDate ? sql`${column} >= ${startDate}::date` : sql`true`}
    and ${column} <= ${endDate}::date`;
}

function mondayWeekStart(day: string) {
  const value = new Date(`${day}T00:00:00.000Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

function bucket(day: string, grain: SearchAnalyticsFilters['resolvedGrain']) {
  if (grain === 'day') return day;
  if (grain === 'week') return mondayWeekStart(day);
  return `${day.slice(0, 7)}-01`;
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

export function canonicalSearchPath(value: string) {
  try {
    const path = new URL(value, 'https://bricomaitre.com').pathname.replace(/\/$/, '') || '/';
    return path.replace(/^\/(?:fr|ar|en)(?=\/|$)/, '') || '/';
  } catch {
    return value;
  }
}

export function isBrandedSearchQuery(query: string) {
  return /(?:brico\s*ma[iî]tre|bricomaitre|بريكو\s*ماستر)/iu.test(query);
}

function positionBand(position: number | null) {
  if (position == null) return 'unknown';
  if (position <= 3) return '1–3';
  if (position <= 5) return '4–5';
  if (position <= 10) return '6–10';
  if (position <= 20) return '11–20';
  return '21+';
}

function rowAggregate(row: Record<string, unknown>): AggregateRow {
  const impressions = number(row.impressions);
  return {
    key: String(row.key ?? ''),
    clicks: number(row.clicks),
    impressions,
    position: impressions > 0 ? nullableNumber(row.weighted_position) : null,
    secondaryCount: number(row.secondary_count),
  };
}

function benchmarkByBand(rows: AggregateRow[]) {
  const groups = new Map<string, { clicks: number; impressions: number }>();
  for (const row of rows) {
    const key = positionBand(row.position);
    const current = groups.get(key) ?? { clicks: 0, impressions: 0 };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    groups.set(key, current);
  }
  return new Map(
    [...groups].map(([key, value]) => [key, ratio(value.clicks, value.impressions) ?? 0]),
  );
}

export function buildSearchOpportunities(rows: AggregateRow[]) {
  const benchmarks = benchmarkByBand(rows);
  return rows
    .map((row) => {
      const ctrPct = ratio(row.clicks, row.impressions);
      const benchmarkCtrPct = benchmarks.get(positionBand(row.position)) ?? 0;
      const potentialClicks = Math.max(
        0,
        Math.round((row.impressions * Math.max(0, benchmarkCtrPct - (ctrPct ?? 0))) / 100),
      );
      const kind =
        row.position != null &&
        row.position >= 4 &&
        row.position <= 15 &&
        row.impressions >= 20 &&
        potentialClicks >= 2
          ? 'strikingDistance'
          : potentialClicks >= 2 && row.position != null && row.position <= 10
            ? 'ctrGap'
            : row.position != null && row.position > 15 && row.impressions >= 30
              ? 'contentGap'
              : null;
      return {
        query: row.key,
        clicks: row.clicks,
        impressions: row.impressions,
        ctrPct,
        position: row.position,
        pages: row.secondaryCount,
        branded: isBrandedSearchQuery(row.key),
        benchmarkCtrPct,
        potentialClicks,
        opportunity: kind,
      };
    })
    .filter((row) => row.opportunity != null)
    .sort(
      (left, right) =>
        right.potentialClicks - left.potentialClicks || right.impressions - left.impressions,
    )
    .slice(0, 100);
}

async function totals(db: Database, startDate: string | null, endDate: string) {
  const result = await db.execute(sql`
    select coalesce(sum(${searchConsoleDailyTotals.clicks}), 0) as clicks,
      coalesce(sum(${searchConsoleDailyTotals.impressions}), 0) as impressions,
      case when sum(${searchConsoleDailyTotals.impressions}) > 0
        then sum(${searchConsoleDailyTotals.clicks}) / sum(${searchConsoleDailyTotals.impressions}) * 100
      end as ctr_pct,
      case when sum(${searchConsoleDailyTotals.impressions}) > 0
        then sum(${searchConsoleDailyTotals.position} * ${searchConsoleDailyTotals.impressions})
          / sum(${searchConsoleDailyTotals.impressions})
      end as weighted_position,
      count(*)::int as days,
      min(${searchConsoleDailyTotals.day}) as first_day,
      max(${searchConsoleDailyTotals.day}) as through_day,
      max(${searchConsoleDailyTotals.syncedAt}) as synced_at
    from ${searchConsoleDailyTotals}
    where ${searchConsoleDailyTotals.searchType} = 'web'
      and ${datePredicate(searchConsoleDailyTotals.day, startDate, endDate)}
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    clicks: number(row.clicks),
    impressions: number(row.impressions),
    ctrPct: nullableNumber(row.ctr_pct),
    position: nullableNumber(row.weighted_position),
    days: number(row.days),
    firstDay: row.first_day ? String(row.first_day) : null,
    throughDay: row.through_day ? String(row.through_day) : null,
    syncedAt: iso(row.synced_at),
  };
}

async function detailTotals(db: Database, startDate: string | null, endDate: string) {
  const result = await db.execute(sql`
    select coalesce(sum(${searchConsoleDailyRows.clicks}), 0) as clicks,
      coalesce(sum(${searchConsoleDailyRows.impressions}), 0) as impressions,
      coalesce(sum(${searchConsoleDailyRows.clicks}) filter (
        where lower(${searchConsoleDailyRows.query}) like '%bricomaitre%'
          or lower(${searchConsoleDailyRows.query}) like '%brico maitre%'
          or lower(${searchConsoleDailyRows.query}) like '%brico maître%'
          or ${searchConsoleDailyRows.query} like '%بريكو%'
      ), 0) as branded_clicks
    from ${searchConsoleDailyRows}
    where ${searchConsoleDailyRows.searchType} = 'web'
      and ${datePredicate(searchConsoleDailyRows.day, startDate, endDate)}
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  return {
    clicks: number(row.clicks),
    impressions: number(row.impressions),
    brandedClicks: number(row.branded_clicks),
  };
}

async function aggregates(
  db: Database,
  dimension: 'query' | 'page' | 'device' | 'country',
  startDate: string | null,
  endDate: string,
  limit: number,
) {
  const key =
    dimension === 'query'
      ? searchConsoleDailyRows.query
      : dimension === 'page'
        ? searchConsoleDailyRows.page
        : dimension === 'device'
          ? searchConsoleDailyRows.device
          : searchConsoleDailyRows.country;
  const secondary =
    dimension === 'query' ? searchConsoleDailyRows.page : searchConsoleDailyRows.query;
  const result = await db.execute(sql`
    select ${key} as key,
      sum(${searchConsoleDailyRows.clicks}) as clicks,
      sum(${searchConsoleDailyRows.impressions}) as impressions,
      case when sum(${searchConsoleDailyRows.impressions}) > 0
        then sum(${searchConsoleDailyRows.position} * ${searchConsoleDailyRows.impressions})
          / sum(${searchConsoleDailyRows.impressions})
      end as weighted_position,
      count(distinct ${secondary})::int as secondary_count
    from ${searchConsoleDailyRows}
    where ${searchConsoleDailyRows.searchType} = 'web'
      and ${key} <> ''
      and ${datePredicate(searchConsoleDailyRows.day, startDate, endDate)}
    group by ${key}
    order by sum(${searchConsoleDailyRows.impressions}) desc
    limit ${limit}
  `);
  return records(result.rows).map(rowAggregate);
}

async function queryPagePairs(db: Database, startDate: string | null, endDate: string) {
  const result = await db.execute(sql`
    select ${searchConsoleDailyRows.query} as query,
      ${searchConsoleDailyRows.page} as page,
      sum(${searchConsoleDailyRows.clicks}) as clicks,
      sum(${searchConsoleDailyRows.impressions}) as impressions
    from ${searchConsoleDailyRows}
    where ${searchConsoleDailyRows.searchType} = 'web'
      and ${searchConsoleDailyRows.query} <> ''
      and ${searchConsoleDailyRows.page} <> ''
      and ${datePredicate(searchConsoleDailyRows.day, startDate, endDate)}
    group by ${searchConsoleDailyRows.query}, ${searchConsoleDailyRows.page}
    order by sum(${searchConsoleDailyRows.impressions}) desc
    limit 2000
  `);
  return records(result.rows).map((row) => ({
    query: String(row.query ?? ''),
    page: String(row.page ?? ''),
    clicks: number(row.clicks),
    impressions: number(row.impressions),
  })) satisfies QueryPageRow[];
}

async function trend(db: Database, filters: SearchAnalyticsFilters) {
  const result = await db.execute(sql`
    select ${searchConsoleDailyTotals.day} as day,
      ${searchConsoleDailyTotals.clicks} as clicks,
      ${searchConsoleDailyTotals.impressions} as impressions,
      ${searchConsoleDailyTotals.position} as position
    from ${searchConsoleDailyTotals}
    where ${searchConsoleDailyTotals.searchType} = 'web'
      and ${datePredicate(searchConsoleDailyTotals.day, filters.startDate, filters.endDate)}
    order by ${searchConsoleDailyTotals.day}
  `);
  const groups = new Map<
    string,
    { bucket: string; clicks: number; impressions: number; weightedPosition: number }
  >();
  for (const raw of records(result.rows)) {
    const day = String(raw.day);
    const key = bucket(day, filters.resolvedGrain);
    const current = groups.get(key) ?? {
      bucket: key,
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
    };
    const impressions = number(raw.impressions);
    current.clicks += number(raw.clicks);
    current.impressions += impressions;
    current.weightedPosition += number(raw.position) * impressions;
    groups.set(key, current);
  }
  return [...groups.values()].map((row) => ({
    bucket: row.bucket,
    clicks: row.clicks,
    impressions: row.impressions,
    ctrPct: ratio(row.clicks, row.impressions),
    position: row.impressions > 0 ? row.weightedPosition / row.impressions : null,
  }));
}

async function appearances(db: Database, startDate: string | null, endDate: string) {
  const result = await db.execute(sql`
    select ${searchConsoleDailyAppearances.appearance} as appearance,
      sum(${searchConsoleDailyAppearances.clicks}) as clicks,
      sum(${searchConsoleDailyAppearances.impressions}) as impressions,
      case when sum(${searchConsoleDailyAppearances.impressions}) > 0
        then sum(${searchConsoleDailyAppearances.clicks})
          / sum(${searchConsoleDailyAppearances.impressions}) * 100
      end as ctr_pct,
      case when sum(${searchConsoleDailyAppearances.impressions}) > 0
        then sum(${searchConsoleDailyAppearances.position} * ${searchConsoleDailyAppearances.impressions})
          / sum(${searchConsoleDailyAppearances.impressions})
      end as position
    from ${searchConsoleDailyAppearances}
    where ${searchConsoleDailyAppearances.searchType} = 'web'
      and ${datePredicate(searchConsoleDailyAppearances.day, startDate, endDate)}
    group by ${searchConsoleDailyAppearances.appearance}
    order by sum(${searchConsoleDailyAppearances.impressions}) desc
  `);
  return records(result.rows).map((row) => ({
    appearance: String(row.appearance ?? ''),
    clicks: number(row.clicks),
    impressions: number(row.impressions),
    ctrPct: nullableNumber(row.ctr_pct),
    position: nullableNumber(row.position),
  }));
}

async function indexHealth(db: Database) {
  const [inspectionResult, sitemapResult, syncResult] = await Promise.all([
    db.execute(sql`
      select * from ${searchConsoleUrlInspections}
      order by ${searchConsoleUrlInspections.inspectedAt} desc
      limit 100
    `),
    db.execute(sql`
      select * from ${searchConsoleSitemaps}
      order by ${searchConsoleSitemaps.syncedAt} desc
    `),
    db.execute(sql`
      select * from ${searchConsoleSyncRuns}
      order by ${searchConsoleSyncRuns.startedAt} desc
      limit 1
    `),
  ]);
  const inspections = records(inspectionResult.rows).map((row) => {
    const canonicalMismatch = Boolean(
      row.google_canonical &&
      row.user_canonical &&
      canonicalSearchPath(String(row.google_canonical)) !==
        canonicalSearchPath(String(row.user_canonical)),
    );
    const verdict = row.verdict ? String(row.verdict) : null;
    return {
      url: String(row.url),
      path: canonicalSearchPath(String(row.url)),
      verdict,
      coverageState: row.coverage_state ? String(row.coverage_state) : null,
      pageFetchState: row.page_fetch_state ? String(row.page_fetch_state) : null,
      indexingState: row.indexing_state ? String(row.indexing_state) : null,
      googleCanonical: row.google_canonical ? String(row.google_canonical) : null,
      userCanonical: row.user_canonical ? String(row.user_canonical) : null,
      canonicalMismatch,
      lastCrawlAt: iso(row.last_crawl_at),
      inspectedAt: iso(row.inspected_at),
      needsAttention:
        verdict === 'FAIL' ||
        verdict === 'PARTIAL' ||
        canonicalMismatch ||
        String(row.page_fetch_state ?? '') === 'ERROR',
    };
  });
  const sitemaps = records(sitemapResult.rows).map((row) => ({
    path: String(row.path),
    pending: Boolean(row.is_pending),
    warnings: number(row.warnings),
    errors: number(row.errors),
    submittedUrls: number(row.submitted_urls),
    lastDownloadedAt: iso(row.last_downloaded_at),
    syncedAt: iso(row.synced_at),
  }));
  const run = records(syncResult.rows)[0];
  return {
    inspections,
    issues: inspections.filter((row) => row.needsAttention),
    sitemaps,
    lastSync: run
      ? {
          status: String(run.status),
          since: String(run.since_day),
          until: String(run.until_day),
          startedAt: iso(run.started_at),
          completedAt: iso(run.completed_at),
          detailRows: number(run.detail_rows_fetched),
        }
      : null,
  };
}

function topRelations(pairs: QueryPageRow[], field: 'query' | 'page') {
  const groups = new Map<string, QueryPageRow[]>();
  for (const pair of pairs) {
    const key = pair[field];
    const current = groups.get(key) ?? [];
    current.push(pair);
    groups.set(key, current);
  }
  return groups;
}

export async function loadSearchAnalytics(db: Database, filters: SearchAnalyticsFilters) {
  const [
    current,
    previous,
    detailed,
    daily,
    queryRows,
    pageRows,
    deviceRows,
    countryRows,
    pairs,
    rich,
    index,
  ] = await Promise.all([
    totals(db, filters.startDate, filters.endDate),
    filters.comparisonStartDate && filters.comparisonEndDate
      ? totals(db, filters.comparisonStartDate, filters.comparisonEndDate)
      : Promise.resolve(null),
    detailTotals(db, filters.startDate, filters.endDate),
    trend(db, filters),
    aggregates(db, 'query', filters.startDate, filters.endDate, 500),
    aggregates(db, 'page', filters.startDate, filters.endDate, 300),
    aggregates(db, 'device', filters.startDate, filters.endDate, 20),
    aggregates(db, 'country', filters.startDate, filters.endDate, 50),
    queryPagePairs(db, filters.startDate, filters.endDate),
    appearances(db, filters.startDate, filters.endDate),
    indexHealth(db),
  ]);

  const byQuery = topRelations(pairs, 'query');
  const byPage = topRelations(pairs, 'page');
  const opportunities = buildSearchOpportunities(queryRows).map((row) => ({
    ...row,
    topPages: (byQuery.get(row.query) ?? []).slice(0, 5).map((pair) => ({
      page: pair.page,
      path: canonicalSearchPath(pair.page),
      clicks: pair.clicks,
      impressions: pair.impressions,
    })),
  }));
  const pages = pageRows.map((row) => ({
    page: row.key,
    path: canonicalSearchPath(row.key),
    clicks: row.clicks,
    impressions: row.impressions,
    ctrPct: ratio(row.clicks, row.impressions),
    position: row.position,
    queries: row.secondaryCount,
    topQueries: (byPage.get(row.key) ?? []).slice(0, 5).map((pair) => ({
      query: pair.query,
      clicks: pair.clicks,
      impressions: pair.impressions,
    })),
  }));

  return {
    metrics: {
      clicks: current.clicks,
      impressions: current.impressions,
      ctrPct: current.ctrPct,
      position: current.position,
      previous,
    },
    trend: daily,
    opportunities,
    pages,
    devices: deviceRows.map((row) => ({
      device: row.key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctrPct: ratio(row.clicks, row.impressions),
      position: row.position,
    })),
    countries: countryRows.map((row) => ({
      country: row.key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctrPct: ratio(row.clicks, row.impressions),
      position: row.position,
    })),
    appearances: rich,
    discovery: {
      brandedClicksPct: ratio(detailed.brandedClicks, detailed.clicks),
      nonBrandedClicksPct: ratio(detailed.clicks - detailed.brandedClicks, detailed.clicks),
      queryClickCoveragePct: ratio(detailed.clicks, current.clicks),
      queryImpressionCoveragePct: ratio(detailed.impressions, current.impressions),
    },
    indexHealth: index,
    source: {
      throughDate: current.throughDay,
      updatedAt: current.syncedAt,
      records: current.days,
      detailRows: index.lastSync?.detailRows ?? 0,
    },
  };
}
