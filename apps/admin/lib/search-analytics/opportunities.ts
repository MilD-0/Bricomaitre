import {
  type AggregateRow,
  benchmarkByBand,
  isBrandedSearchQuery,
  positionBand,
  ratio,
} from './values';

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
