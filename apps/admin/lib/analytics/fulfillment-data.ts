import type { AnalyticsFilters } from './contract';
import { isMaterializedEconomicsReport } from './economics-data';
import {
  loadCashPipeline,
  loadFulfillmentSummary,
  loadLeadingOrderForecast,
  withLeadingCashStages,
} from './fulfillment-economics';
import {
  loadAttemptDistribution,
  loadFulfillmentCohorts,
  loadFulfillmentStates,
  loadFulfillmentTrend,
  type FulfillmentStateRow,
} from './fulfillment-cohorts';
import { ratio } from './metrics';
import type { Database, EconomicsReport } from './loaders-shared';

export * from './fulfillment-economics';
export { loadFulfillmentCohorts } from './fulfillment-cohorts';

export async function loadFulfillmentData(
  db: Database,
  filters: AnalyticsFilters,
  economics: EconomicsReport,
) {
  const [summary, trackedStates, attempts, trend, cohorts, cashPipeline, leadingForecast] =
    await Promise.all([
      loadFulfillmentSummary(db, filters.startDate, filters.endDate),
      loadFulfillmentStates(db, filters.startDate, filters.endDate),
      loadAttemptDistribution(
        db,
        filters.startDate,
        filters.endDate,
        isMaterializedEconomicsReport(economics),
      ),
      loadFulfillmentTrend(db, filters.startDate, filters.endDate),
      loadFulfillmentCohorts(db, filters.startDate, filters.endDate, economics),
      loadCashPipeline(db, filters),
      loadLeadingOrderForecast(db, filters, economics.settings),
    ]);
  const typedStates = trackedStates as FulfillmentStateRow[];
  const cohortSize =
    typedStates.reduce((sum, state) => sum + state.orders, 0) + summary.untrackedShipments;
  const states = typedStates.map((state) => ({
    ...state,
    sharePct: ratio(state.orders, cohortSize) ?? 0,
  }));
  if (summary.untrackedShipments > 0) {
    states.push({
      status: 'untracked',
      phase: 'untracked',
      orders: summary.untrackedShipments,
      sharePct: ratio(summary.untrackedShipments, cohortSize) ?? 0,
      staleOrders: 0,
      medianAgeHours: null,
      oldestActivityAt: null,
    });
  }
  return {
    summary,
    states,
    attempts,
    trend,
    cohorts,
    cashPipeline: withLeadingCashStages(cashPipeline, leadingForecast),
    leadingForecast,
  };
}
