import type { getProfitTrackerReport } from '../../profit-tracker';
import type { AnalyticsLeadingOrderForecast } from '../contract';
import { addDays } from '../date-range';
import { robustWeightedAverage } from './baseline';

export type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

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
      forecastPaidOrders: robustWeightedAverage(sample.map((day) => day.paidOrders)) ?? 0,
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
}): AnalyticsLeadingOrderForecast {
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
