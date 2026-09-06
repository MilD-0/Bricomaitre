import { sql, type SQLWrapper } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { getProfitTrackerReport, type ProfitTrackerRangeInput } from '../profit-tracker';
import {
  ANALYTICS_PAID_SHIPMENT_STATUSES,
  ANALYTICS_RESOLVED_SHIPMENT_STATUSES,
} from '../ecotrack-status-policy';
import type { StatsFilters } from '../stats-contract';
import type {
  AnalyticsEffectiveRange,
  AnalyticsFilters,
  AnalyticsMetric,
  AnalyticsSource,
} from './contract';
import { metricChange } from './metrics';

export type Database = ReturnType<typeof getDb>;
export type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

export type AnalyticsReturnObservation = {
  planningRatePct: number;
  mature: {
    ratePct: number | null;
    paid: number;
    returned: number;
    terminal: number;
    cutoffDate: string;
    eligibleOrders: number;
    terminalCoveragePct: number | null;
    cohortStartDate: string | null;
    cohortEndDate: string | null;
  };
  allTerminal: {
    ratePct: number | null;
    paid: number;
    returned: number;
    terminal: number;
  };
};

export type AnalyticsFulfillmentSummary = {
  submittedOrders: number;
  confirmedOrders: number;
  postedOrders: number;
  untrackedShipments: number;
  activeShipments: number;
  deliveredOrders: number;
  paidOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  terminalOrders: number;
  observedReturnRatePct: number | null;
  matureObservedReturnRatePct: number | null;
};

export type AnalyticsMetaEntity = {
  id: string;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  spendEur: number;
  adCostDzd: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  outboundClicks: number;
  uniqueOutboundClicks: number;
  landingPageViews: number;
  addToCarts: number;
  checkouts: number;
  metaPurchases: number;
  purchaseValue: number;
  videoPlays: number;
  videoP25Watched: number;
  videoP50Watched: number;
  videoP75Watched: number;
  videoP95Watched: number;
  videoP100Watched: number;
  videoAverageWatchSeconds: number | null;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
  bricOrders: number;
  confirmedOrders: number;
  postedOrders: number;
  deliveredOrders: number;
  paidOrders: number;
  returnedOrders: number;
  ctrPct: number | null;
  outboundCtrPct: number | null;
  landingViewRatePct: number | null;
  cpmEur: number | null;
  videoPlayRatePct: number | null;
  videoCompletionRatePct: number | null;
  costPerPostedDzd: number | null;
  costPerConfirmedDzd: number | null;
  costPerDeliveredDzd: number | null;
  costPerPaidDzd: number | null;
  platformRoas: number | null;
  attributedAdCostDzd: number;
  outcomeSpendCoveragePct: number | null;
  projectedAdjustedProfitDzd: number;
  automaticPaidProfitDzd: number;
  profitCompleteOrders: number;
  projectedProfitX: number | null;
  paidProfitX: number | null;
  profitCoveragePct: number | null;
};

export function statsInput(startDate: string | null, endDate: string): StatsFilters {
  return startDate ? { range: 'custom', startDate, endDate } : { range: 'all', endDate };
}

export function economicsInput(startDate: string | null, endDate: string): ProfitTrackerRangeInput {
  return startDate ? { range: 'custom', startDate, endDate } : { range: 'all', endDate };
}

export function effectiveRange(
  key: string,
  filters: AnalyticsFilters,
  sources: AnalyticsSource['key'][],
): AnalyticsEffectiveRange {
  return { key, startDate: filters.startDate, endDate: filters.endDate, sources };
}

export function metric(
  key: string,
  value: number | null,
  previous: number | null,
  unit: AnalyticsMetric['unit'],
  goodWhen: AnalyticsMetric['goodWhen'] = 'up',
): AnalyticsMetric {
  return { key, value, previous, changePct: metricChange(value, previous), unit, goodWhen };
}

export function metricWithProjectedComparison(
  key: string,
  value: number | null,
  previous: number | null,
  unit: AnalyticsMetric['unit'],
  comparison: { value: number | null; previous: number | null },
  goodWhen: AnalyticsMetric['goodWhen'] = 'up',
): AnalyticsMetric {
  if (comparison.value == null || comparison.previous == null) {
    return metric(key, value, previous, unit, goodWhen);
  }
  return {
    key,
    value,
    previous,
    changePct: metricChange(comparison.value, comparison.previous),
    comparison: {
      basis: 'projected_completion',
      value: comparison.value,
      previous: comparison.previous,
    },
    unit,
    goodWhen,
  };
}

export function fulfillmentPhase(status: string) {
  if (status === 'paye_et_archive' || status === 'payed') return 'paid';
  if (status.startsWith('retour')) return 'return';
  if (status === 'annule') return 'cancelled';
  if (
    status === 'livre_non_encaisse' ||
    status === 'encaisse_non_paye' ||
    status === 'paiements_prets'
  ) {
    return 'cash';
  }
  if (status === 'en_livraison') return 'delivery';
  if (
    status === 'vers_hub' ||
    status === 'en_hub' ||
    status === 'vers_wilaya' ||
    status === 'en_ramassage'
  ) {
    return 'transit';
  }
  if (status === 'prete_a_expedier' || status === 'en_preparation') return 'ready';
  return 'exception';
}

export const resolvedShipmentStatusesSql = sql.join(
  ANALYTICS_RESOLVED_SHIPMENT_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

export const paidShipmentStatusesSql = sql.join(
  ANALYTICS_PAID_SHIPMENT_STATUSES.map((status) => sql`${status}`),
  sql`, `,
);

export function stateAwareContributionSql(input: {
  grossProfit: SQLWrapper;
  currentStatus: SQLWrapper;
  deliveredAt: SQLWrapper;
  planningReturnRatePct: SQLWrapper;
}) {
  return sql<number | null>`case
    when ${input.grossProfit} is null then null
    when ${input.planningReturnRatePct}::double precision = 100 then 0
    when ${input.currentStatus} in ('retour_archive', 'annule', 'failed') then 0
    when ${input.currentStatus} in ('paye_et_archive', 'payed', 'manual_completed')
      or ${input.deliveredAt} is not null then ${input.grossProfit}::double precision
    else ${input.grossProfit}::double precision
      * (1 - ${input.planningReturnRatePct}::double precision / 100)
  end`;
}
