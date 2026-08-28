import type { getProfitTrackerReport } from '../profit-tracker';
import { operatingCostForDay } from '../profit-tracker-metrics';
import type {
  Analytics2EconomicsPoint,
  Analytics2LeadingOrderForecast,
  Analytics2ResolvedGrain,
} from './contract';
import { addDays } from './date-range';
import { bucketFor } from './economics-series';

type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

function nextForecastWorkingDate(date: string, restFrom: string | null) {
  if (restFrom && date >= restFrom && new Date(`${date}T00:00:00.000Z`).getUTCDay() === 5) {
    return addDays(date, 1);
  }
  return date;
}

function buildPaidOutcomeForecast(input: {
  asOfDate: string;
  historicalStartDate: string | null;
  historicalDays: Array<{ date: string; paidOrders: number }>;
  horizonDays: number;
}) {
  if (!input.historicalStartDate || input.historicalDays.length === 0) return [];
  const observedByDate = new Map(input.historicalDays.map((day) => [day.date, day.paidOrders]));
  const completed: Array<{ date: string; paidOrders: number }> = [];
  for (let date = input.historicalStartDate; date < input.asOfDate; date = addDays(date, 1)) {
    completed.push({ date, paidOrders: observedByDate.get(date) ?? 0 });
  }
  if (completed.length < 7) return [];
  const fallback = completed.slice(-14);
  return Array.from({ length: input.horizonDays }, (_, index) => {
    const date = addDays(input.asOfDate, index + 1);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const sameWeekday = completed
      .filter((day) => new Date(`${day.date}T00:00:00.000Z`).getUTCDay() === weekday)
      .slice(-8);
    const sample = sameWeekday.length >= 2 ? sameWeekday : fallback;
    return {
      date,
      forecastPaidOrders: weightedAverage(sample.map((day) => day.paidOrders)) ?? 0,
    };
  });
}

export function buildLeadingOrderForecast(input: {
  asOfDate: string;
  historicalStartDate: string;
  historicalEndDate: string;
  historicalSubmittedOrders: number;
  historicalConfirmedOrders: number;
  historicalPostedOrders: number;
  paidOutcomeHistory?: {
    startDate: string;
    days: Array<{ date: string; paidOrders: number }>;
  };
  submittedOrders: number;
  submittedCodDzd: number;
  submittedGrossProfitDzd: number;
  confirmedOrders: number;
  confirmedCodDzd: number;
  confirmedGrossProfitDzd: number;
  medianSubmittedToPostedHours: number | null;
  medianConfirmedToPostedHours: number | null;
  planningReturnRatePct: number;
  restFrom: string | null;
}): Analytics2LeadingOrderForecast {
  const submittedToConfirmedRate =
    input.historicalSubmittedOrders > 0
      ? input.historicalConfirmedOrders / input.historicalSubmittedOrders
      : null;
  const confirmedToPostedRate =
    input.historicalConfirmedOrders > 0
      ? input.historicalPostedOrders / input.historicalConfirmedOrders
      : null;
  const submittedToPostedRate =
    submittedToConfirmedRate == null || confirmedToPostedRate == null
      ? null
      : submittedToConfirmedRate * confirmedToPostedRate;
  const returnMultiplier = 1 - input.planningReturnRatePct / 100;
  const dueDate = (hours: number | null) =>
    nextForecastWorkingDate(
      addDays(input.asOfDate, Math.max(1, Math.ceil((hours ?? 24) / 24))),
      input.restFrom,
    );
  const submittedConfidence = submittedToPostedRate;
  const confirmedConfidence = confirmedToPostedRate;
  const submitted = {
    orders: input.submittedOrders,
    codDzd: input.submittedCodDzd,
    grossProfitDzd: input.submittedGrossProfitDzd,
    expectedPostedOrders: input.submittedOrders * (submittedConfidence ?? 0),
    expectedGrossProfitDzd: input.submittedGrossProfitDzd * (submittedConfidence ?? 0),
    expectedAdjustedProfitDzd:
      input.submittedGrossProfitDzd * (submittedConfidence ?? 0) * returnMultiplier,
    confidencePct: submittedConfidence == null ? null : submittedConfidence * 100,
    expectedPostingDate: dueDate(input.medianSubmittedToPostedHours),
  };
  const confirmed = {
    orders: input.confirmedOrders,
    codDzd: input.confirmedCodDzd,
    grossProfitDzd: input.confirmedGrossProfitDzd,
    expectedPostedOrders: input.confirmedOrders * (confirmedConfidence ?? 0),
    expectedGrossProfitDzd: input.confirmedGrossProfitDzd * (confirmedConfidence ?? 0),
    expectedAdjustedProfitDzd:
      input.confirmedGrossProfitDzd * (confirmedConfidence ?? 0) * returnMultiplier,
    confidencePct: confirmedConfidence == null ? null : confirmedConfidence * 100,
    expectedPostingDate: dueDate(input.medianConfirmedToPostedHours),
  };
  const byDay = new Map<
    string,
    {
      date: string;
      expectedPostedOrders: number;
      expectedGrossProfitDzd: number;
      expectedAdjustedProfitDzd: number;
      forecastPaidOrders: number | null;
    }
  >();
  for (const stage of [submitted, confirmed]) {
    const current = byDay.get(stage.expectedPostingDate) ?? {
      date: stage.expectedPostingDate,
      expectedPostedOrders: 0,
      expectedGrossProfitDzd: 0,
      expectedAdjustedProfitDzd: 0,
      forecastPaidOrders: null,
    };
    current.expectedPostedOrders += stage.expectedPostedOrders;
    current.expectedGrossProfitDzd += stage.expectedGrossProfitDzd;
    current.expectedAdjustedProfitDzd += stage.expectedAdjustedProfitDzd;
    byDay.set(stage.expectedPostingDate, current);
  }
  const paidOutcomeDays = buildPaidOutcomeForecast({
    asOfDate: input.asOfDate,
    historicalStartDate: input.paidOutcomeHistory?.startDate ?? null,
    historicalDays: input.paidOutcomeHistory?.days ?? [],
    horizonDays: 14,
  });
  for (const paidDay of paidOutcomeDays) {
    const current = byDay.get(paidDay.date) ?? {
      date: paidDay.date,
      expectedPostedOrders: 0,
      expectedGrossProfitDzd: 0,
      expectedAdjustedProfitDzd: 0,
      forecastPaidOrders: null,
    };
    current.forecastPaidOrders = paidDay.forecastPaidOrders;
    byDay.set(paidDay.date, current);
  }
  const days = [...byDay.values()].sort((left, right) => left.date.localeCompare(right.date));
  return {
    asOfDate: input.asOfDate,
    historicalWindow: {
      startDate: input.historicalStartDate,
      endDate: input.historicalEndDate,
      submittedOrders: input.historicalSubmittedOrders,
      confirmedOrders: input.historicalConfirmedOrders,
      postedOrders: input.historicalPostedOrders,
    },
    rates: {
      submittedToConfirmedPct:
        submittedToConfirmedRate == null ? null : submittedToConfirmedRate * 100,
      confirmedToPostedPct: confirmedToPostedRate == null ? null : confirmedToPostedRate * 100,
      submittedToPostedPct: submittedToPostedRate == null ? null : submittedToPostedRate * 100,
    },
    stages: { submitted, confirmed },
    days,
    expectedPostedOrders: submitted.expectedPostedOrders + confirmed.expectedPostedOrders,
    expectedGrossProfitDzd: submitted.expectedGrossProfitDzd + confirmed.expectedGrossProfitDzd,
    expectedAdjustedProfitDzd:
      submitted.expectedAdjustedProfitDzd + confirmed.expectedAdjustedProfitDzd,
    forecastPaidOrders:
      paidOutcomeDays.length > 0
        ? paidOutcomeDays.reduce((sum, day) => sum + day.forecastPaidOrders, 0)
        : null,
  };
}

function weightedAverage(values: number[]) {
  if (!values.length) return null;
  const denominator = values.reduce((sum, _value, index) => sum + index + 1, 0);
  return values.reduce((sum, value, index) => sum + value * (index + 1), 0) / denominator;
}

function standardDeviation(values: number[], mean: number) {
  if (values.length < 2) return 0;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  );
}

export function buildEconomicsForecast(
  report: EconomicsReport,
  today: string,
  horizonDays = 14,
  leading?: Analytics2LeadingOrderForecast,
) {
  const completed = [...report.days]
    .flatMap((day) => {
      if (day.date >= today || day.isRestDay) return [];
      const adjustedProfitDzd =
        day.metrics?.adjustedProfitDzd ??
        (day.postedOrders === 0 && day.metrics?.adCostDzd != null ? 0 : null);
      const correctedTrueProfitDzd =
        adjustedProfitDzd != null && day.metrics?.adCostDzd != null
          ? adjustedProfitDzd - day.metrics.adCostDzd - (day.operatingCostDzd ?? 0)
          : day.trueProfitDzd;
      return correctedTrueProfitDzd == null
        ? []
        : [
            {
              date: day.date,
              trueProfitDzd: correctedTrueProfitDzd,
              postedOrders: day.postedOrders ?? 0,
              grossProfitDzd: day.grossProfitDzd ?? null,
              adjustedProfitDzd,
              adCostDzd: day.metrics?.adCostDzd ?? null,
            },
          ];
    })
    .reverse()
    .slice(-56);
  if (completed.length < 7) return [];
  const fallback = completed.slice(-14);

  const weightedMetric = <T>(sample: T[], read: (value: T) => number | null) =>
    weightedAverage(
      sample.flatMap((value) => {
        const metricValue = read(value);
        return metricValue == null ? [] : [metricValue];
      }),
    );

  const leadingByDate = new Map(leading?.days.map((day) => [day.date, day]) ?? []);
  return Array.from({ length: horizonDays }, (_, index) => {
    const date = addDays(today, index + 1);
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const isConfiguredRestDay = Boolean(
      report.settings?.restFrom && date >= report.settings.restFrom && weekday === 5,
    );
    if (isConfiguredRestDay) {
      const operatingCostDzd = operatingCostForDay(date, report.costs ?? []);
      const forecastTrueProfitDzd = operatingCostDzd === 0 ? 0 : -operatingCostDzd;
      return {
        date,
        forecastGrossProfitDzd: 0,
        forecastAdjustedProfitDzd: 0,
        forecastAdCostDzd: 0,
        forecastNetProfitDzd: 0,
        forecastOperatingCostDzd: operatingCostDzd,
        forecastTrueProfitDzd,
        lowerTrueProfitDzd: forecastTrueProfitDzd,
        upperTrueProfitDzd: forecastTrueProfitDzd,
        forecastPostedOrders: 0,
        forecastPaidOrders: leadingByDate.get(date)?.forecastPaidOrders ?? null,
        samples: 0,
        method: 'configured-rest-day',
      } as const;
    }
    const sameWeekday = completed
      .filter((day) => new Date(`${day.date}T00:00:00.000Z`).getUTCDay() === weekday)
      .slice(-8);
    const sample = sameWeekday.length >= 2 ? sameWeekday : fallback;
    const profits = sample.map((day) => day.trueProfitDzd as number);
    const orderCounts = sample.map((day) => day.postedOrders ?? 0);
    const baselineGrossProfitDzd = weightedMetric(sample, (day) => day.grossProfitDzd);
    const baselineAdjustedProfitDzd = weightedMetric(sample, (day) => day.adjustedProfitDzd);
    const baselinePostedOrders = weightedAverage(orderCounts) ?? 0;
    const leadingDay = leadingByDate.get(date);
    const forecastGrossProfitDzd =
      baselineGrossProfitDzd == null
        ? (leadingDay?.expectedGrossProfitDzd ?? null)
        : Math.max(baselineGrossProfitDzd, leadingDay?.expectedGrossProfitDzd ?? 0);
    const forecastAdjustedProfitDzd =
      baselineAdjustedProfitDzd == null
        ? (leadingDay?.expectedAdjustedProfitDzd ?? null)
        : Math.max(baselineAdjustedProfitDzd, leadingDay?.expectedAdjustedProfitDzd ?? 0);
    const forecastAdCostDzd = weightedMetric(sample, (day) => day.adCostDzd);
    const forecastOperatingCostDzd = operatingCostForDay(date, report.costs ?? []);
    const forecastNetProfitDzd =
      forecastAdjustedProfitDzd != null && forecastAdCostDzd != null
        ? forecastAdjustedProfitDzd - forecastAdCostDzd
        : null;
    const forecastTrueProfitDzd =
      forecastNetProfitDzd != null
        ? forecastNetProfitDzd - forecastOperatingCostDzd
        : (weightedAverage(profits) ?? 0);
    const spread = standardDeviation(profits, forecastTrueProfitDzd);
    return {
      date,
      forecastGrossProfitDzd,
      forecastAdjustedProfitDzd,
      forecastAdCostDzd,
      forecastNetProfitDzd,
      forecastOperatingCostDzd,
      forecastTrueProfitDzd,
      lowerTrueProfitDzd: forecastTrueProfitDzd - 1.28 * spread,
      upperTrueProfitDzd: forecastTrueProfitDzd + 1.28 * spread,
      forecastPostedOrders: Math.max(baselinePostedOrders, leadingDay?.expectedPostedOrders ?? 0),
      forecastPaidOrders: leadingDay?.forecastPaidOrders ?? null,
      knownPipelinePostedOrders: leadingDay?.expectedPostedOrders ?? 0,
      knownPipelineGrossProfitDzd: leadingDay?.expectedGrossProfitDzd ?? 0,
      knownPipelineAdjustedProfitDzd: leadingDay?.expectedAdjustedProfitDzd ?? 0,
      samples: sample.length,
      method: leadingDay
        ? 'historical-baseline-with-pipeline-floor'
        : sameWeekday.length >= 2
          ? 'weekday-weighted'
          : 'recent-weighted',
    } as const;
  });
}

type EconomicsForecastPoint = ReturnType<typeof buildEconomicsForecast>[number];

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
  points: Analytics2EconomicsPoint[],
  forecast: EconomicsForecastPoint[],
  grain: Analytics2ResolvedGrain,
) {
  return points.map((point) => {
    if (!point.isPartial) return point;
    const remaining = forecast.filter((row) => bucketFor(row.date, grain) === point.bucket);
    if (!remaining.length) return point;

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
      profitXProjected:
        adjustedProfitDzdProjected != null && adCostDzdProjected != null && adCostDzdProjected > 0
          ? adjustedProfitDzdProjected / adCostDzdProjected
          : null,
      profitXBeforeReturnsProjected:
        grossProfitDzdProjected != null && adCostDzdProjected != null && adCostDzdProjected > 0
          ? grossProfitDzdProjected / adCostDzdProjected
          : null,
      cumulativeNetProfitDzdProjected: add(point.cumulativeNetProfitDzd, netRemainder),
      cumulativeTrueProfitDzdProjected: add(point.cumulativeTrueProfitDzd, trueProfitRemainder),
      projectionDays: remaining.length,
    };
  });
}
