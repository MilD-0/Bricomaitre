import { indexHealth } from './index-health';
import { buildSearchOpportunities } from './opportunities';
import { aggregates, appearances, detailTotals, queryPagePairs, totals, trend } from './queries';
import {
  canonicalSearchPath,
  ratio,
  searchPageLabel,
  type Database,
  type QueryPageRow,
  type SearchAnalyticsFilters,
} from './values';

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
    label: searchPageLabel(row.key),
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
      fromDate: current.firstDay,
      throughDate: current.throughDay,
      updatedAt: current.syncedAt,
      records: current.days,
      detailRows: index.lastSync?.detailRows ?? 0,
    },
  };
}
