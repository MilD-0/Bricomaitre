import type { AnalyticsEconomicsPoint, AnalyticsResolvedGrain } from '../contract';
import { inclusiveDays } from '../date-range';
import { bucketFor, economicsBucketEnd } from '../economics-series';
import { buildEconomicsForecast } from './economics';

type EconomicsForecastPoint = Omit<
  ReturnType<typeof buildEconomicsForecast>[number],
  'profitsSuppressed'
> & { profitsSuppressed?: boolean };

function sumForecastMetric(
  rows: EconomicsForecastPoint[],
  read: (row: EconomicsForecastPoint) => number | null,
) {
  const values = rows.map(read);
  return values.some((value) => value == null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function projectOpenEconomicsSeries(
  points: AnalyticsEconomicsPoint[],
  forecast: EconomicsForecastPoint[],
  grain: AnalyticsResolvedGrain,
) {
  return points.map((point) => {
    if (!point.isPartial) return point;
    const remaining = forecast.filter((row) => bucketFor(row.date, grain) === point.bucket);
    if (!remaining.length || remaining.at(-1)?.date !== economicsBucketEnd(point.bucket, grain)) {
      return point;
    }

    const profitsSuppressed = remaining.every((row) => row.profitsSuppressed);
    const grossRemainder = sumForecastMetric(remaining, (row) => row.forecastGrossProfitDzd);
    const adjustedRemainder = sumForecastMetric(remaining, (row) => row.forecastAdjustedProfitDzd);
    const adCostRemainder = sumForecastMetric(remaining, (row) => row.forecastAdCostDzd);
    const netRemainder = sumForecastMetric(remaining, (row) => row.forecastNetProfitDzd);
    const trueProfitRemainder = sumForecastMetric(remaining, (row) => row.forecastTrueProfitDzd);
    const add = (actual: number | null, remainder: number | null) =>
      actual == null || remainder == null ? null : actual + remainder;
    const grossProfitDzdProjected = add(point.grossProfitDzd, grossRemainder);
    const adjustedProfitDzdProjected = add(point.adjustedProfitDzd, adjustedRemainder);
    const adCostDzdProjected = add(point.adCostDzd, adCostRemainder);
    const netProfitDzdProjected = add(point.netProfitDzd, netRemainder);
    const trueProfitDzdProjected = add(point.trueProfitDzd, trueProfitRemainder);

    return {
      ...point,
      grossProfitDzdProjected,
      adjustedProfitDzdProjected,
      adCostDzdProjected,
      netProfitDzdProjected,
      trueProfitDzdProjected,
      profitXProjected: profitsSuppressed
        ? 0
        : adjustedProfitDzdProjected != null && adCostDzdProjected != null && adCostDzdProjected > 0
          ? adjustedProfitDzdProjected / adCostDzdProjected
          : null,
      profitXBeforeReturnsProjected: profitsSuppressed
        ? 0
        : grossProfitDzdProjected != null && adCostDzdProjected != null && adCostDzdProjected > 0
          ? grossProfitDzdProjected / adCostDzdProjected
          : null,
      cumulativeNetProfitDzdProjected: add(point.cumulativeNetProfitDzd, netRemainder),
      cumulativeTrueProfitDzdProjected: add(point.cumulativeTrueProfitDzd, trueProfitRemainder),
      projectionDays: remaining.length,
    };
  });
}

export function appendEconomicsForecastSeries(
  points: AnalyticsEconomicsPoint[],
  forecast: EconomicsForecastPoint[],
  grain: AnalyticsResolvedGrain,
) {
  const projected = projectOpenEconomicsSeries(points, forecast, grain);
  const last = projected.at(-1);
  if (!last) return projected;

  const future = new Map<string, EconomicsForecastPoint[]>();
  for (const row of forecast) {
    const bucket = bucketFor(row.date, grain);
    if (bucket <= last.bucket) continue;
    const rows = future.get(bucket) ?? [];
    rows.push(row);
    future.set(bucket, rows);
  }
  let cumulativeNetProfitDzd = last.cumulativeNetProfitDzdProjected ?? last.cumulativeNetProfitDzd;
  let cumulativeTrueProfitDzd =
    last.cumulativeTrueProfitDzdProjected ?? last.cumulativeTrueProfitDzd;
  const futurePoints: AnalyticsEconomicsPoint[] = [];
  for (const [bucket, rows] of [...future.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const end = economicsBucketEnd(bucket, grain);
    if (
      rows[0]?.date !== bucket ||
      rows.at(-1)?.date !== end ||
      rows.length !== inclusiveDays(bucket, end)
    ) {
      continue;
    }
    const profitsSuppressed = rows.every((row) => row.profitsSuppressed);
    const grossProfitDzd = sumForecastMetric(rows, (row) => row.forecastGrossProfitDzd);
    const adjustedProfitDzd = sumForecastMetric(rows, (row) => row.forecastAdjustedProfitDzd);
    const adCostDzd = sumForecastMetric(rows, (row) => row.forecastAdCostDzd);
    const netProfitDzd = sumForecastMetric(rows, (row) => row.forecastNetProfitDzd);
    const trueProfitDzd = sumForecastMetric(rows, (row) => row.forecastTrueProfitDzd);
    cumulativeNetProfitDzd =
      cumulativeNetProfitDzd == null || netProfitDzd == null
        ? null
        : cumulativeNetProfitDzd + netProfitDzd;
    cumulativeTrueProfitDzd =
      cumulativeTrueProfitDzd == null || trueProfitDzd == null
        ? null
        : cumulativeTrueProfitDzd + trueProfitDzd;
    const postedOrders = rows.reduce((sum, row) => sum + row.forecastPostedOrders, 0);
    futurePoints.push({
      bucket,
      label: bucket,
      grossProfitDzd: null,
      adjustedProfitDzd: null,
      adCostDzd: null,
      netProfitDzd: null,
      trueProfitDzd: null,
      realizedProfitDzd: null,
      realizedProfitAfterAdsDzd: null,
      postedOrders,
      settledOrders: 0,
      profitX: null,
      profitXBeforeReturns: null,
      projectedCoveragePct: null,
      cumulativeNetProfitDzd: null,
      cumulativeTrueProfitDzd: null,
      cumulativeRealizedProfitDzd: null,
      isPartial: false,
      grossProfitDzdProjected: grossProfitDzd,
      adjustedProfitDzdProjected: adjustedProfitDzd,
      adCostDzdProjected: adCostDzd,
      netProfitDzdProjected: netProfitDzd,
      trueProfitDzdProjected: trueProfitDzd,
      profitXProjected: profitsSuppressed
        ? 0
        : adjustedProfitDzd != null && adCostDzd != null && adCostDzd > 0
          ? adjustedProfitDzd / adCostDzd
          : null,
      profitXBeforeReturnsProjected: profitsSuppressed
        ? 0
        : grossProfitDzd != null && adCostDzd != null && adCostDzd > 0
          ? grossProfitDzd / adCostDzd
          : null,
      cumulativeNetProfitDzdProjected: cumulativeNetProfitDzd,
      cumulativeTrueProfitDzdProjected: cumulativeTrueProfitDzd,
      projectionDays: rows.length,
      isForecast: true,
    });
  }
  return [...projected, ...futurePoints];
}
