import type { getProfitTrackerReport } from '../profit-tracker';
import type {
  AnalyticsAutomaticPaidDay,
  AnalyticsAutomaticPaidEconomics,
  AnalyticsEconomicsPoint,
  AnalyticsResolvedGrain,
} from './contract';
import { addDays } from './date-range';
import { ratio } from './metrics';

type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

export function fridayWeekStart(date: string) {
  const value = new Date(`${date}T00:00:00.000Z`);
  const offset = (value.getUTCDay() - 5 + 7) % 7;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

export function bucketFor(date: string, grain: AnalyticsResolvedGrain) {
  if (grain === 'day') return date;
  if (grain === 'week') return fridayWeekStart(date);
  return `${date.slice(0, 7)}-01`;
}

function bucketEnd(bucket: string, grain: AnalyticsResolvedGrain) {
  if (grain === 'day') return bucket;
  if (grain === 'week') return addDays(bucket, 6);
  const monthAfter = new Date(`${bucket}T00:00:00.000Z`);
  monthAfter.setUTCMonth(monthAfter.getUTCMonth() + 1);
  return addDays(monthAfter.toISOString().slice(0, 10), -1);
}

export function aggregateEconomicsSeries(
  report: EconomicsReport,
  grain: AnalyticsResolvedGrain,
  today: string,
): AnalyticsEconomicsPoint[] {
  const realizedByDate = new Map(report.realized.days.map((day) => [day.date, day]));
  type Accumulator = {
    bucket: string;
    grossProfitDzd: number;
    grossSamples: number;
    adjustedProfitDzd: number;
    adjustedSamples: number;
    adCostDzd: number;
    adSamples: number;
    operatingCostDzd: number;
    realizedProfitDzd: number;
    realizedSamples: number;
    realizedProfitAfterAdsDzd: number;
    realizedAfterAdsSamples: number;
    postedOrders: number;
    settledOrders: number;
    costCompleteOrders: number;
    days: string[];
  };
  const groups = new Map<string, Accumulator>();

  for (const day of [...report.days].reverse()) {
    const bucket = bucketFor(day.date, grain);
    const current = groups.get(bucket) ?? {
      bucket,
      grossProfitDzd: 0,
      grossSamples: 0,
      adjustedProfitDzd: 0,
      adjustedSamples: 0,
      adCostDzd: 0,
      adSamples: 0,
      operatingCostDzd: 0,
      realizedProfitDzd: 0,
      realizedSamples: 0,
      realizedProfitAfterAdsDzd: 0,
      realizedAfterAdsSamples: 0,
      postedOrders: 0,
      settledOrders: 0,
      costCompleteOrders: 0,
      days: [],
    };
    const realized = realizedByDate.get(day.date);
    current.days.push(day.date);
    current.postedOrders += day.postedOrders ?? 0;
    current.costCompleteOrders += day.costCompleteOrders ?? 0;
    current.settledOrders += realized?.settledOrders ?? 0;
    current.operatingCostDzd += day.operatingCostDzd ?? 0;
    if (day.grossProfitDzd != null) {
      current.grossProfitDzd += day.grossProfitDzd;
      current.grossSamples += 1;
    }
    if (day.metrics.adjustedProfitDzd != null) {
      current.adjustedProfitDzd += day.metrics.adjustedProfitDzd;
      current.adjustedSamples += 1;
    }
    if (day.metrics.adCostDzd != null) {
      current.adCostDzd += day.metrics.adCostDzd;
      current.adSamples += 1;
    }
    if (realized) {
      current.realizedProfitDzd += realized.realizedProfitDzd;
      current.realizedSamples += 1;
      if (realized.realizedProfitAfterAdsDzd != null) {
        current.realizedProfitAfterAdsDzd += realized.realizedProfitAfterAdsDzd;
        current.realizedAfterAdsSamples += 1;
      }
    }
    groups.set(bucket, current);
  }

  let cumulativeAdjustedProfitDzd = 0;
  let cumulativeAdCostDzd = 0;
  let cumulativeOperatingCostDzd = 0;
  let cumulativeRealizedProfitDzd = 0;
  const latestTrackedDate = [...groups.values()]
    .flatMap((group) => group.days)
    .sort()
    .at(-1);
  return [...groups.values()]
    .sort((left, right) => left.bucket.localeCompare(right.bucket))
    .map((group) => {
      const grossProfitDzd = group.grossSamples ? group.grossProfitDzd : null;
      const adjustedProfitDzd = group.adjustedSamples ? group.adjustedProfitDzd : null;
      const adCostDzd = group.adSamples ? group.adCostDzd : null;
      const netProfitDzd =
        adjustedProfitDzd != null && adCostDzd != null ? adjustedProfitDzd - adCostDzd : null;
      const trueProfitDzd = netProfitDzd == null ? null : netProfitDzd - group.operatingCostDzd;
      const realizedProfitDzd = group.realizedSamples ? group.realizedProfitDzd : null;
      if (adjustedProfitDzd != null) cumulativeAdjustedProfitDzd += adjustedProfitDzd;
      if (adCostDzd != null) cumulativeAdCostDzd += adCostDzd;
      cumulativeOperatingCostDzd += group.operatingCostDzd;
      if (realizedProfitDzd != null) cumulativeRealizedProfitDzd += realizedProfitDzd;
      return {
        bucket: group.bucket,
        label: group.bucket,
        grossProfitDzd,
        adjustedProfitDzd,
        adCostDzd,
        netProfitDzd,
        trueProfitDzd,
        realizedProfitDzd,
        realizedProfitAfterAdsDzd:
          realizedProfitDzd != null && adCostDzd != null ? realizedProfitDzd - adCostDzd : null,
        postedOrders: group.postedOrders,
        settledOrders: group.settledOrders,
        profitX:
          adjustedProfitDzd != null && adCostDzd != null && adCostDzd > 0
            ? adjustedProfitDzd / adCostDzd
            : null,
        profitXBeforeReturns:
          grossProfitDzd != null && adCostDzd != null && adCostDzd > 0
            ? grossProfitDzd / adCostDzd
            : null,
        projectedCoveragePct:
          group.postedOrders > 0 ? (group.costCompleteOrders / group.postedOrders) * 100 : null,
        cumulativeNetProfitDzd:
          cumulativeAdjustedProfitDzd || cumulativeAdCostDzd
            ? cumulativeAdjustedProfitDzd - cumulativeAdCostDzd
            : null,
        cumulativeTrueProfitDzd:
          cumulativeAdjustedProfitDzd || cumulativeAdCostDzd
            ? cumulativeAdjustedProfitDzd - cumulativeAdCostDzd - cumulativeOperatingCostDzd
            : null,
        cumulativeRealizedProfitDzd: group.realizedSamples ? cumulativeRealizedProfitDzd : null,
        isPartial:
          group.days.includes(today) ||
          (group.days.includes(latestTrackedDate ?? '') &&
            (latestTrackedDate ?? group.bucket) < bucketEnd(group.bucket, grain)),
        grossProfitDzdProjected: null,
        adjustedProfitDzdProjected: null,
        adCostDzdProjected: null,
        netProfitDzdProjected: null,
        trueProfitDzdProjected: null,
        profitXProjected: null,
        profitXBeforeReturnsProjected: null,
        cumulativeNetProfitDzdProjected: null,
        cumulativeTrueProfitDzdProjected: null,
        projectionDays: 0,
      };
    });
}

export function aggregateAutomaticPaidSeries(
  report: AnalyticsAutomaticPaidEconomics,
  grain: AnalyticsResolvedGrain,
  cutoffDate?: string,
) {
  const groups = new Map<string, Omit<AnalyticsAutomaticPaidDay, 'date'> & { bucket: string }>();
  for (const day of report.days) {
    const bucket = bucketFor(day.date, grain);
    const current = groups.get(bucket) ?? {
      bucket,
      paidOrders: 0,
      codDzd: 0,
      feesDzd: 0,
      netRecoveredDzd: 0,
      productCostDzd: 0,
      profitDzd: 0,
      completeOrders: 0,
      providerAmountOrders: 0,
      legacyAmountOrders: 0,
      submittedAmountOrders: 0,
    };
    current.paidOrders += day.paidOrders;
    current.codDzd += day.codDzd;
    current.feesDzd += day.feesDzd;
    current.netRecoveredDzd += day.netRecoveredDzd;
    current.productCostDzd += day.productCostDzd;
    current.profitDzd += day.profitDzd;
    current.completeOrders += day.completeOrders;
    current.providerAmountOrders += day.providerAmountOrders;
    current.legacyAmountOrders += day.legacyAmountOrders;
    current.submittedAmountOrders += day.submittedAmountOrders;
    groups.set(bucket, current);
  }
  const sorted = [...groups.values()].sort((left, right) =>
    left.bucket.localeCompare(right.bucket),
  );
  const lastBucket = sorted.at(-1)?.bucket;
  return sorted.map((row) => ({
    ...row,
    label: row.bucket,
    profitCoveragePct: ratio(row.completeOrders, row.paidOrders),
    providerAmountCoveragePct: ratio(row.providerAmountOrders, row.paidOrders),
    isPartial: Boolean(
      cutoffDate && row.bucket === lastBucket && cutoffDate < bucketEnd(row.bucket, grain),
    ),
  }));
}
