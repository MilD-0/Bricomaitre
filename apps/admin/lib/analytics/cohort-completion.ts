import { sql } from 'drizzle-orm';

import { analyticsOrderCohortFacts, orderLineItems } from '@bric/db/schema';
import { ANALYTICS_FACT_SEMANTICS_VERSION } from '../analytics-fact-contract';
import type { AnalyticsFilters } from './contract';
import type { Database } from './loaders-shared';
import { nullableNumeric, numeric } from './query-values';

export type CohortCompletionOrder = {
  postedDay: string;
  deliveredDay: string | null;
  outcome: string;
  grossProfitDzd: number | null;
  units: number;
};

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

export function projectCohortCompletion(
  orders: CohortCompletionOrder[],
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
    const delivered = order.deliveredDay != null;
    const manuallyCompleted = order.outcome === 'manual_completed';
    const terminalLoss = isTerminalLoss(order.outcome);
    const unresolved = !terminalPaid && !delivered && !manuallyCompleted && !terminalLoss;
    const paidProbability = terminalPaid
      ? 1
      : delivered
        ? 1
        : terminalLoss || manuallyCompleted
          ? 0
          : unresolvedPaidRate;
    const contributionProbability =
      terminalPaid || delivered || manuallyCompleted ? 1 : terminalLoss ? 0 : paidProbability;
    if (unresolved) unresolvedOrders += 1;
    projectedPaidOrders += paidProbability;
    projectedPaidUnits += order.units * paidProbability;
    if (order.grossProfitDzd != null) {
      projectedAdjustedProfitDzd += order.grossProfitDzd * contributionProbability;
      profitSamples += 1;
    }

    const day = byDay.get(order.postedDay) ?? {
      observedOrders: 0,
      projectedPaidOrders: 0,
      projectedAdjustedProfitDzd: 0,
      profitSamples: 0,
    };
    day.observedOrders += 1;
    day.projectedPaidOrders += paidProbability;
    if (order.grossProfitDzd != null) {
      day.projectedAdjustedProfitDzd += order.grossProfitDzd * contributionProbability;
      day.profitSamples += 1;
    }
    byDay.set(order.postedDay, day);
  }

  return {
    observedOrders: selected.length,
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
    with item_units as (
      select ${orderLineItems.orderId} as order_id,
        coalesce(sum(${orderLineItems.quantity}), 0)::int as units
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    )
    select ${analyticsOrderCohortFacts.postedDay}::text as posted_day,
      (${analyticsOrderCohortFacts.deliveredAt} at time zone 'Africa/Algiers')::date::text
        as delivered_day,
      ${analyticsOrderCohortFacts.outcome} as outcome,
      ${analyticsOrderCohortFacts.grossProfitDzd}::double precision as gross_profit_dzd,
      coalesce(item_units.units, 0)::int as units
    from ${analyticsOrderCohortFacts}
    left join item_units on item_units.order_id = ${analyticsOrderCohortFacts.orderId}
    where ${analyticsOrderCohortFacts.semanticsVersion} = ${ANALYTICS_FACT_SEMANTICS_VERSION}
      and ${firstDate ? sql`${analyticsOrderCohortFacts.postedDay} >= ${firstDate}::date` : sql`true`}
      and ${analyticsOrderCohortFacts.postedDay} <= ${filters.endDate}::date
    order by ${analyticsOrderCohortFacts.postedDay}, ${analyticsOrderCohortFacts.orderId}
  `);
  const orders = Array.from(result.rows as Iterable<unknown>, (raw): CohortCompletionOrder => {
    const row = raw as Record<string, unknown>;
    return {
      postedDay: String(row.posted_day),
      deliveredDay: row.delivered_day ? String(row.delivered_day) : null,
      outcome: String(row.outcome),
      grossProfitDzd: nullableNumeric(row.gross_profit_dzd),
      units: numeric(row.units),
    };
  });
  if (!orders.length) return null;
  const current = projectCohortCompletion(orders, filters, fallbackPaidRate);
  const previous =
    filters.comparisonStartDate && filters.comparisonEndDate
      ? projectCohortCompletion(
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
