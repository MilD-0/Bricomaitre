import { getDb } from '@bric/db/client';
import { searchConsoleDailyTotals } from '@bric/db/schema';
import { sql, type SQLWrapper } from 'drizzle-orm';

export type Database = ReturnType<typeof getDb>;

export type SearchAnalyticsFilters = {
  startDate: string | null;
  endDate: string;
  comparisonStartDate: string | null;
  comparisonEndDate: string | null;
  resolvedGrain: 'day' | 'week' | 'month';
};

export type AggregateRow = {
  key: string;
  clicks: number;
  impressions: number;
  position: number | null;
  secondaryCount: number;
};

export type QueryPageRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
};

export function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

export function iso(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function datePredicate(column: SQLWrapper, startDate: string | null, endDate: string) {
  return sql`${startDate ? sql`${column} >= ${startDate}::date` : sql`true`}
    and ${column} <= ${endDate}::date`;
}

export async function loadSearchThroughDate(db: Database, endDate: string) {
  const result = await db.execute(sql`
    select max(${searchConsoleDailyTotals.day}) as through_day
    from ${searchConsoleDailyTotals}
    where ${searchConsoleDailyTotals.searchType} = 'web'
      and ${searchConsoleDailyTotals.day} <= ${endDate}::date
  `);
  const value = (result.rows[0] as { through_day?: unknown } | undefined)?.through_day;
  return value ? String(value) : null;
}

function mondayWeekStart(day: string) {
  const value = new Date(`${day}T00:00:00.000Z`);
  const offset = (value.getUTCDay() + 6) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

export function bucket(day: string, grain: SearchAnalyticsFilters['resolvedGrain']) {
  if (grain === 'day') return day;
  if (grain === 'week') return mondayWeekStart(day);
  return `${day.slice(0, 7)}-01`;
}

export function ratio(numerator: number, denominator: number) {
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

export function searchPageLabel(value: string) {
  try {
    const pathname = new URL(value, 'https://bricomaitre.com').pathname;
    const locale = pathname.match(/^\/(fr|ar|en)(?=\/|$)/)?.[1];
    const path = canonicalSearchPath(value);
    return locale ? `${path} · ${locale.toUpperCase()}` : path;
  } catch {
    return value;
  }
}

export function isBrandedSearchQuery(query: string) {
  return /(?:brico\s*ma[iî]tre|bricomaitre|بريكو\s*ماستر)/iu.test(query);
}

export function positionBand(position: number | null) {
  if (position == null) return 'unknown';
  if (position <= 3) return '1–3';
  if (position <= 5) return '4–5';
  if (position <= 10) return '6–10';
  if (position <= 20) return '11–20';
  return '21+';
}

export function rowAggregate(row: Record<string, unknown>): AggregateRow {
  const impressions = number(row.impressions);
  return {
    key: String(row.key ?? ''),
    clicks: number(row.clicks),
    impressions,
    position: impressions > 0 ? nullableNumber(row.weighted_position) : null,
    secondaryCount: number(row.secondary_count),
  };
}

export function benchmarkByBand(rows: AggregateRow[]) {
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
