import { sql } from 'drizzle-orm';

import { analyticsOrderCohortFacts, orderLineItems } from '@bric/db/schema';
import { ANALYTICS_FACT_SEMANTICS_VERSION } from '../analytics-fact-contract';
import type { AnalyticsFilters } from './contract';
import type { Database } from './loaders-shared';
import { nullableNumeric, numeric } from './query-values';

export type CohortCompletionProjection = {
  observedOrders: number;
  unresolvedOrders: number;
  projectedPaidOrders: number;
  projectedPaidUnits: number;
  projectedAdjustedProfitDzd: number | null;
  days: Array<{
    date: string;
    observedOrders: number;
    projectedPaidOrders: number;
    projectedAdjustedProfitDzd: number | null;
  }>;
};

export type CohortCompletionPair = {
  current: CohortCompletionProjection;
  previous: CohortCompletionProjection | null;
};

function isPaid(outcome: string) {
  return outcome === 'paye_et_archive' || outcome === 'payed';
}

function isTerminalLoss(outcome: string) {
  return outcome === 'retour_archive' || outcome === 'annule' || outcome === 'failed';
}

type CohortCompletionGroup = {
  postedDay: string;
  outcome: string;
  grossProfitDzd: number | null;
  units: number;
  delivered: boolean;
  observedOrders: number;
  profitSamples: number;
};

export function projectCohortCompletionGroups(
  orders: CohortCompletionGroup[],
  range: Pick<AnalyticsFilters, 'startDate' | 'endDate'>,
  fallbackPaidRate: number,
): CohortCompletionProjection {
  const unresolvedPaidRate = Math.min(1, Math.max(0, fallbackPaidRate));
  const selected = orders.filter(
    (order) =>
      (!range.startDate || order.postedDay >= range.startDate) && order.postedDay <= range.endDate,
  );
  const byDay = new Map<
    string,
    {
      observedOrders: number;
      projectedPaidOrders: number;
      projectedAdjustedProfitDzd: number;
      profitSamples: number;
    }
  >();
  let unresolvedOrders = 0;
  let projectedPaidOrders = 0;
  let projectedPaidUnits = 0;
  let projectedAdjustedProfitDzd = 0;
  let profitSamples = 0;

  for (const order of selected) {
    const terminalPaid = isPaid(order.outcome);
    const delivered = order.delivered;
    const manuallyCompleted = order.outcome === 'manual_completed';
    const terminalLoss = isTerminalLoss(order.outcome);
    const unresolved = !terminalPaid && !delivered && !manuallyCompleted && !terminalLoss;
    const paidProbability =
      terminalLoss || manuallyCompleted ? 0 : terminalPaid || delivered ? 1 : unresolvedPaidRate;
    const contributionProbability = terminalLoss ? 0 : manuallyCompleted ? 1 : paidProbability;
    if (unresolved) unresolvedOrders += order.observedOrders;
    projectedPaidOrders += paidProbability * order.observedOrders;
    projectedPaidUnits += order.units * paidProbability;
    if (order.grossProfitDzd != null) {
      projectedAdjustedProfitDzd += order.grossProfitDzd * contributionProbability;
      profitSamples += order.profitSamples;
    }

    const day = byDay.get(order.postedDay) ?? {
      observedOrders: 0,
      projectedPaidOrders: 0,
      projectedAdjustedProfitDzd: 0,
      profitSamples: 0,
    };
    day.observedOrders += order.observedOrders;
    day.projectedPaidOrders += paidProbability * order.observedOrders;
    if (order.grossProfitDzd != null) {
      day.projectedAdjustedProfitDzd += order.grossProfitDzd * contributionProbability;
      day.profitSamples += order.profitSamples;
    }
    byDay.set(order.postedDay, day);
  }

  return {
    observedOrders: selected.reduce((sum, group) => sum + group.observedOrders, 0),
    unresolvedOrders,
    projectedPaidOrders,
    projectedPaidUnits,
    projectedAdjustedProfitDzd: profitSamples > 0 ? projectedAdjustedProfitDzd : null,
    days: [...byDay.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, day]) => ({
        date,
        observedOrders: day.observedOrders,
        projectedPaidOrders: day.projectedPaidOrders,
        projectedAdjustedProfitDzd: day.profitSamples > 0 ? day.projectedAdjustedProfitDzd : null,
      })),
  };
}

export async function loadCohortCompletionPair(
  db: Database,
  filters: AnalyticsFilters,
  fallbackPaidRate: number,
): Promise<CohortCompletionPair | null> {
  const firstDate = filters.comparisonStartDate ?? filters.startDate;
  const result = await db.execute(sql`
    select ${analyticsOrderCohortFacts.postedDay}::text as posted_day,
      (${analyticsOrderCohortFacts.deliveredAt} is not null) as delivered,
      ${analyticsOrderCohortFacts.outcome} as outcome,
      sum(${analyticsOrderCohortFacts.grossProfitDzd})::double precision as gross_profit_dzd,
      count(*)::int as observed_orders,
      count(${analyticsOrderCohortFacts.grossProfitDzd})::int as profit_samples,
      coalesce(sum(item_units.units), 0)::int as units
    from ${analyticsOrderCohortFacts}
    left join lateral (
      select coalesce(sum(${orderLineItems.quantity}), 0)::int as units
      from ${orderLineItems}
      where ${orderLineItems.orderId} = ${analyticsOrderCohortFacts.orderId}
    ) item_units on true
    where ${analyticsOrderCohortFacts.semanticsVersion} = ${ANALYTICS_FACT_SEMANTICS_VERSION}
      and ${firstDate ? sql`${analyticsOrderCohortFacts.postedDay} >= ${firstDate}::date` : sql`true`}
      and ${analyticsOrderCohortFacts.postedDay} <= ${filters.endDate}::date
    group by ${analyticsOrderCohortFacts.postedDay}, ${analyticsOrderCohortFacts.outcome},
      (${analyticsOrderCohortFacts.deliveredAt} is not null)
    order by ${analyticsOrderCohortFacts.postedDay}, ${analyticsOrderCohortFacts.outcome},
      (${analyticsOrderCohortFacts.deliveredAt} is not null)
  `);
  const orders = Array.from(result.rows as Iterable<unknown>, (raw): CohortCompletionGroup => {
    const row = raw as Record<string, unknown>;
    return {
      postedDay: String(row.posted_day),
      delivered: row.delivered === true,
      observedOrders: numeric(row.observed_orders),
      profitSamples: numeric(row.profit_samples),
      outcome: String(row.outcome),
      grossProfitDzd: nullableNumeric(row.gross_profit_dzd),
      units: numeric(row.units),
    };
  });
  if (!orders.length) return null;
  const current = projectCohortCompletionGroups(orders, filters, fallbackPaidRate);
  const previous =
    filters.comparisonStartDate && filters.comparisonEndDate
      ? projectCohortCompletionGroups(
          orders,
          { startDate: filters.comparisonStartDate, endDate: filters.comparisonEndDate },
          fallbackPaidRate,
        )
      : null;
  return { current, previous };
}

export function cohortCompletionCovers(
  postedOrders: number,
  projection: CohortCompletionProjection | null | undefined,
) {
  if (!projection) return false;
  if (postedOrders === 0) return projection.observedOrders === 0;
  return projection.observedOrders / postedOrders >= 0.95;
}
