import {
  calculateProfitAmounts,
  dayProfitsSuppressed,
  operatingCostForDay,
  profitSuppressionApplies,
} from '../../profit-tracker-metrics';
import type { AnalyticsLeadingOrderForecast } from '../contract';
import { addDays } from '../date-range';
import { baselineValue, chooseBaselineMethod, robustDeviation, weightedAverage } from './baseline';
import { type EconomicsReport } from './orders';

export function buildEconomicsForecast(
  report: EconomicsReport,
  today: string,
  horizonDays = 14,
  leading?: AnalyticsLeadingOrderForecast,
  currentDayRemainingFraction = 0,
) {
  const profitsSuppressed = profitSuppressionApplies(report.settings?.defaultReturnRate);
  const completed = [...report.days]
    .flatMap((day) => {
      if (day.date >= today || day.isRestDay) return [];
      const adjustedProfitDzd =
        day.metrics?.adjustedProfitDzd ??
        (day.postedOrders === 0 && day.metrics?.adCostDzd != null ? 0 : null);
      const { trueProfitDzd } = calculateProfitAmounts({
        adjustedProfitDzd,
        adCostDzd: day.metrics?.adCostDzd ?? null,
        operatingCostDzd: day.operatingCostDzd,
        profitsSuppressed: profitsSuppressed || dayProfitsSuppressed(day),
      });
      const correctedTrueProfitDzd = trueProfitDzd ?? day.trueProfitDzd;
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
  const baselineMethod = chooseBaselineMethod(completed);
  const residuals = completed.slice(Math.max(14, completed.length - 28)).flatMap((actual) => {
    const history = completed.filter((day) => day.date < actual.date);
    const predicted = baselineValue(
      history,
      actual.date,
      (day) => day.trueProfitDzd,
      baselineMethod,
    );
    return predicted == null ? [] : [actual.trueProfitDzd - predicted];
  });
  const baselineSpread = robustDeviation(residuals);

  const leadingByDate = new Map(leading?.days.map((day) => [day.date, day]) ?? []);
  const remainingFraction = Math.max(0, Math.min(1, currentDayRemainingFraction));
  const schedule = [
    ...(remainingFraction > 0
      ? [{ date: today, horizonIndex: 0, share: remainingFraction, currentDayRemainder: true }]
      : []),
    ...Array.from({ length: horizonDays }, (_, horizonIndex) => ({
      date: addDays(today, horizonIndex + 1),
      horizonIndex,
      share: 1,
      currentDayRemainder: false,
    })),
  ];
  return schedule.map(({ date, horizonIndex, share, currentDayRemainder }) => {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const isConfiguredRestDay = Boolean(
      report.settings?.restFrom && date >= report.settings.restFrom && weekday === 5,
    );
    if (isConfiguredRestDay) {
      const operatingCostDzd = currentDayRemainder
        ? 0
        : operatingCostForDay(date, report.costs ?? []);
      const forecastTrueProfitDzd = calculateProfitAmounts({
        adjustedProfitDzd: 0,
        adCostDzd: 0,
        operatingCostDzd,
        profitsSuppressed,
      }).trueProfitDzd!;
      return {
        date,
        profitsSuppressed,
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
        currentDayRemainder,
      } as const;
    }
    const sameWeekday = completed
      .filter((day) => new Date(`${day.date}T00:00:00.000Z`).getUTCDay() === weekday)
      .slice(-8);
    const sample = sameWeekday.length < 2 ? completed.slice(-14) : sameWeekday;
    const profits = sample.map((day) => day.trueProfitDzd as number);
    const baselineGrossProfitDzd = baselineValue(
      completed,
      date,
      (day) => day.grossProfitDzd,
      baselineMethod,
    );
    const baselineAdjustedProfitDzd = baselineValue(
      completed,
      date,
      (day) => day.adjustedProfitDzd,
      baselineMethod,
    );
    const baselinePostedOrders =
      baselineValue(completed, date, (day) => day.postedOrders, baselineMethod) ?? 0;
    const leadingDay = leadingByDate.get(date);
    const fullDayGrossProfitDzd =
      baselineGrossProfitDzd == null
        ? (leadingDay?.expectedGrossProfitDzd ?? null)
        : Math.max(baselineGrossProfitDzd, leadingDay?.expectedGrossProfitDzd ?? 0);
    const fullDayAdjustedProfitDzd =
      baselineAdjustedProfitDzd == null
        ? (leadingDay?.expectedAdjustedProfitDzd ?? null)
        : Math.max(baselineAdjustedProfitDzd, leadingDay?.expectedAdjustedProfitDzd ?? 0);
    const fullDayAdCostDzd = baselineValue(completed, date, (day) => day.adCostDzd, baselineMethod);
    const forecastGrossProfitDzd =
      fullDayGrossProfitDzd == null ? null : fullDayGrossProfitDzd * share;
    const projectedAdjusted =
      fullDayAdjustedProfitDzd == null ? null : fullDayAdjustedProfitDzd * share;
    const forecastAdCostDzd = fullDayAdCostDzd == null ? null : fullDayAdCostDzd * share;
    const forecastOperatingCostDzd = currentDayRemainder
      ? 0
      : operatingCostForDay(date, report.costs ?? []);
    const amounts = calculateProfitAmounts({
      adjustedProfitDzd: projectedAdjusted,
      adCostDzd: forecastAdCostDzd,
      operatingCostDzd: forecastOperatingCostDzd,
      profitsSuppressed,
    });
    const forecastAdjustedProfitDzd = amounts.adjustedProfitDzd;
    const forecastNetProfitDzd = amounts.netProfitDzd;
    const forecastTrueProfitDzd = amounts.trueProfitDzd ?? (weightedAverage(profits) ?? 0) * share;
    const horizonScale = Math.sqrt(1 + horizonIndex / 10);
    const spread = profitsSuppressed ? 0 : baselineSpread * horizonScale * share;
    return {
      date,
      profitsSuppressed,
      forecastGrossProfitDzd,
      forecastAdjustedProfitDzd,
      forecastAdCostDzd,
      forecastNetProfitDzd,
      forecastOperatingCostDzd,
      forecastTrueProfitDzd,
      lowerTrueProfitDzd: forecastTrueProfitDzd - 1.28 * spread,
      upperTrueProfitDzd: forecastTrueProfitDzd + 1.28 * spread,
      forecastPostedOrders:
        Math.max(baselinePostedOrders, leadingDay?.expectedPostedOrders ?? 0) * share,
      forecastPaidOrders: currentDayRemainder ? null : (leadingDay?.forecastPaidOrders ?? null),
      knownPipelinePostedOrders: (leadingDay?.expectedPostedOrders ?? 0) * share,
      knownPipelineGrossProfitDzd: (leadingDay?.expectedGrossProfitDzd ?? 0) * share,
      knownPipelineAdjustedProfitDzd: profitsSuppressed
        ? 0
        : (leadingDay?.expectedAdjustedProfitDzd ?? 0) * share,
      samples: sample.length,
      method: leadingDay
        ? 'historical-baseline-with-pipeline-floor'
        : `backtested-${baselineMethod}`,
      currentDayRemainder,
    } as const;
  });
}
