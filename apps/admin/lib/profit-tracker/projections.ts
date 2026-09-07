import { getDb } from '@bric/db/client';
import { profitTrackerDays } from '@bric/db/schema';
import { and, asc, gte, lte } from 'drizzle-orm';
import { addDays, resolveAnalyticsFilters } from '../analytics/date-range';
import { applyProfitTrackerRollforward } from '../profit-tracker-metrics';
import {
  indexMetaDays,
  loadProfitTrackerCalculationDays,
  resolveProfitTrackerDaySources,
} from './calculation';
import {
  profitTrackerRangeSchema,
  type CanonicalOrderProjectionBasis,
  type CanonicalOrderProjectionDay,
  type Database,
} from './contract';
import { getProfitTrackerSettings, mapDay } from './records';
import { loadMetaDayEconomics, loadOrderCohortDayEconomics } from './sources';

function inclusiveDateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) dates.push(date);
  return dates;
}

export function toCanonicalOrderProjectionDay({
  basis,
  reportDay,
  day,
  defaultReturnRate,
}: {
  basis: CanonicalOrderProjectionBasis;
  reportDay: string;
  day?: ReturnType<typeof applyProfitTrackerRollforward>[number];
  defaultReturnRate: number;
}): CanonicalOrderProjectionDay {
  const grossProfit = day?.grossProfitDzd ?? null;
  const adSpend = day?.metrics.adCostDzd ?? null;
  const estimatedReturnRate = day?.returnRatePct ?? defaultReturnRate;
  const returnExposedOrders = day?.returnExposedOrders ?? day?.postedOrders ?? 0;
  const adjustedProfit = day?.metrics.adjustedProfitDzd ?? null;

  return {
    basis,
    reportDay,
    grossProfit,
    adSpend,
    estimatedReturnRate,
    estimatedReturnedOrders: returnExposedOrders * (estimatedReturnRate / 100),
    estimatedReturnLoss:
      grossProfit !== null && adjustedProfit !== null
        ? Math.max(0, grossProfit - adjustedProfit)
        : null,
    projectedProfit:
      estimatedReturnRate === 100
        ? 0
        : adjustedProfit !== null && adSpend !== null
          ? adjustedProfit - adSpend
          : null,
  };
}

export async function getCanonicalOrderProjectionDays(
  input: {
    startDate: string;
    endDate: string;
    basis: CanonicalOrderProjectionBasis;
  },
  options: { db?: Database; now?: Date } = {},
): Promise<CanonicalOrderProjectionDay[]> {
  const db = options.db ?? getDb();
  const dates = inclusiveDateRange(input.startDate, input.endDate);

  if (input.basis === 'posted') {
    const filters = resolveAnalyticsFilters(
      {
        ...profitTrackerRangeSchema.parse({
          range: 'custom',
          startDate: input.startDate,
          endDate: input.endDate,
        }),
        view: 'money',
        grain: 'auto',
      },
      options.now,
    );
    const { settings, selected } = await loadProfitTrackerCalculationDays(db, filters);
    const byDate = new Map(selected.map((day) => [day.date, day]));
    return dates.map((reportDay) =>
      toCanonicalOrderProjectionDay({
        basis: input.basis,
        reportDay,
        day: byDate.get(reportDay),
        defaultReturnRate: settings.defaultReturnRate,
      }),
    );
  }

  const queryStartDate = addDays(input.startDate, -7);
  const calculationDates = inclusiveDateRange(queryStartDate, input.endDate);
  const [settings, manualRows, cohortDays, metaDays] = await Promise.all([
    getProfitTrackerSettings(db),
    db
      .select()
      .from(profitTrackerDays)
      .where(
        and(gte(profitTrackerDays.day, queryStartDate), lte(profitTrackerDays.day, input.endDate)),
      )
      .orderBy(asc(profitTrackerDays.day)),
    loadOrderCohortDayEconomics(db, queryStartDate, input.endDate, 2),
    loadMetaDayEconomics(db, queryStartDate, input.endDate),
  ]);
  const manualByDate = new Map(manualRows.map((row) => [row.day, mapDay(row)]));
  const cohortByDate = new Map(cohortDays.map((day) => [day.date, day]));
  const metaByDate = indexMetaDays(metaDays, manualRows);
  const inputs = calculationDates.map((date) => {
    const manual = manualByDate.get(date);
    const cohort = cohortByDate.get(date);
    return resolveProfitTrackerDaySources({
      date,
      manual: manual
        ? {
            ...manual,
            // Daily gross-profit/count overrides belong to the posted-order accounting cohort.
            // Confirmed projections share only its planning return and FX assumptions.
            grossProfitDzd: null,
            confirmedOrders: null,
          }
        : undefined,
      automatic: cohort
        ? {
            date,
            postedOrders: cohort.orderCount,
            costCompleteOrders: cohort.costCompleteOrders,
            grossProfitDzd: cohort.grossProfitDzd,
            realizedGrossProfitDzd: cohort.realizedGrossProfitDzd,
            returnExposedGrossProfitDzd: cohort.returnExposedGrossProfitDzd,
            returnExposedOrders: cohort.returnExposedOrders,
          }
        : undefined,
      meta: metaByDate.get(date),
      settings,
    });
  });
  const byDate = new Map(
    applyProfitTrackerRollforward(inputs, settings).map((day) => [day.date, day]),
  );

  return dates.map((reportDay) =>
    toCanonicalOrderProjectionDay({
      basis: input.basis,
      reportDay,
      day: byDate.get(reportDay),
      defaultReturnRate: settings.defaultReturnRate,
    }),
  );
}
