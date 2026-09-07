import {
  searchConsoleDailyAppearances,
  searchConsoleDailyRows,
  searchConsoleDailyTotals,
} from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import {
  bucket,
  datePredicate,
  iso,
  nullableNumber,
  number,
  ratio,
  records,
  rowAggregate,
  type Database,
  type QueryPageRow,
  type SearchAnalyticsFilters,
} from './values';

export async function totals(db: Database, startDate: string | null, endDate: string) {
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

export async function detailTotals(db: Database, startDate: string | null, endDate: string) {
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

export async function aggregates(
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

export async function queryPagePairs(db: Database, startDate: string | null, endDate: string) {
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

export async function trend(db: Database, filters: SearchAnalyticsFilters) {
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

export async function appearances(db: Database, startDate: string | null, endDate: string) {
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
