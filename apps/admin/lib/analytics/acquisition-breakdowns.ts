import { sql } from 'drizzle-orm';

import {
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  metaAdsBreakdownDailyInsights,
  metaAdsDailyInsights,
  metaAdsDeliveryEntities,
  orderAcquisitionAttribution,
  orders,
} from '@bric/db/schema';
import type { AnalyticsFilters } from './contract';
import { ratio } from './metrics';
import {
  datePredicate,
  isoValue,
  nullableNumeric,
  numeric,
  timestampPredicate,
} from './query-values';
import { type Database, type EconomicsReport } from './loaders-shared';

export async function loadMetaBreakdowns(
  db: Database,
  filters: AnalyticsFilters,
  economics: EconomicsReport,
) {
  const [breakdownResult, budgetsResult, maturationResult] = await Promise.all([
    db.execute(sql`
      select ${metaAdsBreakdownDailyInsights.day}::text as day,
        ${metaAdsBreakdownDailyInsights.breakdownKind} as kind,
        ${metaAdsBreakdownDailyInsights.publisherPlatform} as publisher_platform,
        ${metaAdsBreakdownDailyInsights.platformPosition} as platform_position,
        ${metaAdsBreakdownDailyInsights.impressionDevice} as impression_device,
        ${metaAdsBreakdownDailyInsights.region} as region,
        coalesce(sum(${metaAdsBreakdownDailyInsights.spend}), 0)::double precision as spend_eur,
        coalesce(sum(${metaAdsBreakdownDailyInsights.impressions}), 0)::double precision
          as impressions,
        coalesce(sum(${metaAdsBreakdownDailyInsights.outboundClicks}), 0)::double precision
          as outbound_clicks,
        coalesce(sum(${metaAdsBreakdownDailyInsights.landingPageViews}), 0)::double precision
          as landing_page_views,
        coalesce(sum(${metaAdsBreakdownDailyInsights.purchases}), 0)::double precision
          as purchases,
        coalesce(sum(${metaAdsBreakdownDailyInsights.purchaseValue}), 0)::double precision
          as purchase_value
      from ${metaAdsBreakdownDailyInsights}
      where ${datePredicate(metaAdsBreakdownDailyInsights.day, filters.startDate, filters.endDate)}
      group by ${metaAdsBreakdownDailyInsights.day},
        ${metaAdsBreakdownDailyInsights.breakdownKind},
        ${metaAdsBreakdownDailyInsights.publisherPlatform},
        ${metaAdsBreakdownDailyInsights.platformPosition},
        ${metaAdsBreakdownDailyInsights.impressionDevice},
        ${metaAdsBreakdownDailyInsights.region}
      order by sum(${metaAdsBreakdownDailyInsights.spend}) desc
    `),
    db.execute(sql`
      with campaign_spend as (
        select ${metaAdsDailyInsights.campaignId} as campaign_id,
          sum(${metaAdsDailyInsights.spend})::double precision as today_spend_eur
        from ${metaAdsDailyInsights}
        where ${metaAdsDailyInsights.day} = ${filters.endDate}::date
        group by ${metaAdsDailyInsights.campaignId}
      ), delivery as (
      select ${metaAdsDeliveryEntities.campaignId} as campaign_id,
        max(${metaAdsDeliveryEntities.campaignName}) as campaign_name,
        coalesce(
          max(${metaAdsDeliveryEntities.dailyBudget}) filter (
            where ${metaAdsDeliveryEntities.entityType} = 'campaign'
          ),
          sum(${metaAdsDeliveryEntities.dailyBudget}) filter (
            where ${metaAdsDeliveryEntities.entityType} = 'adset'
          )
        )::double precision as daily_budget_eur,
        coalesce(
          max(${metaAdsDeliveryEntities.budgetRemaining}) filter (
            where ${metaAdsDeliveryEntities.entityType} = 'campaign'
          ),
          sum(${metaAdsDeliveryEntities.budgetRemaining}) filter (
            where ${metaAdsDeliveryEntities.entityType} = 'adset'
          )
        )::double precision as budget_remaining_eur,
        max(${metaAdsDeliveryEntities.effectiveStatus}) as effective_status,
        max(${metaAdsDeliveryEntities.syncedAt}) as synced_at
      from ${metaAdsDeliveryEntities}
      where ${metaAdsDeliveryEntities.campaignId} is not null
      group by ${metaAdsDeliveryEntities.campaignId}
      )
      select delivery.*, coalesce(campaign_spend.today_spend_eur, 0)::double precision
        as today_spend_eur
      from delivery
      left join campaign_spend using (campaign_id)
    `),
    db.execute(sql`
      with paid as (
        select ${ecotrackOrderTrackingEvents.orderId} as order_id,
          min(
            ${ecotrackOrderTrackingEvents.eventDate}::timestamp
            + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
          ) as paid_at
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.status} = 'payed'
        group by ${ecotrackOrderTrackingEvents.orderId}
      ), attributed as (
        select ${orderAcquisitionAttribution.metaCampaignId} as campaign_id,
          ${orders.id} as order_id,
          (${orders.createdAt} at time zone 'Africa/Algiers')::date as ordered_day,
          paid.paid_at::date as paid_day,
          ${ecotrackOrderStates.currentStatus} as outcome
        from ${orderAcquisitionAttribution}
        inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
        left join paid on paid.order_id = ${orders.id}
        left join ${ecotrackOrderStates}
          on ${ecotrackOrderStates.orderId} = ${orders.id}
          and ${ecotrackOrderStates.deletedAt} is null
        where ${orderAcquisitionAttribution.channel} = 'meta_paid'
          and ${orderAcquisitionAttribution.metaCampaignId} is not null
          and ${timestampPredicate(orders.createdAt, filters.startDate, filters.endDate)}
      )
      select campaign_id,
        count(*)::int as orders,
        count(*) filter (where ordered_day <= ${filters.endDate}::date)::int as eligible_d0,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date
            and paid_day - ordered_day between 0 and 0
        )::int as paid_d0,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '3 days'
        )::int as eligible_d3,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '3 days'
            and paid_day - ordered_day between 0 and 3
        )::int as paid_d3,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '7 days'
        )::int as eligible_d7,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '7 days'
            and paid_day - ordered_day between 0 and 7
        )::int as paid_d7,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '14 days'
        )::int as eligible_d14,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '14 days'
            and paid_day - ordered_day between 0 and 14
        )::int as paid_d14,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
        )::int as eligible_d21,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
            and paid_day - ordered_day between 0 and 21
        )::int as paid_d21,
        count(*) filter (
          where ordered_day <= ${filters.endDate}::date - interval '21 days'
            and outcome in ('paye_et_archive', 'retour_archive')
        )::int as terminal
      from attributed
      group by campaign_id
      order by count(*) desc
    `),
  ]);
  const fxByDay = new Map(
    economics.days.map((day) => [day.date, day.fxRateUsed || economics.settings.fxRate]),
  );
  type BreakdownAccumulator = {
    key: string;
    publisherPlatform: string | null;
    platformPosition: string | null;
    impressionDevice: string | null;
    region: string | null;
    spendEur: number;
    adCostDzd: number;
    impressions: number;
    outboundClicks: number;
    landingPageViews: number;
    purchases: number;
    purchaseValue: number;
  };
  const placementRows = new Map<string, BreakdownAccumulator>();
  const regionRows = new Map<string, BreakdownAccumulator>();
  for (const raw of breakdownResult.rows as Iterable<unknown>) {
    const row = raw as Record<string, unknown>;
    const kind = String(row.kind);
    const publisherPlatform = String(row.publisher_platform || '') || null;
    const platformPosition = String(row.platform_position || '') || null;
    const impressionDevice = String(row.impression_device || '') || null;
    const region = String(row.region || '') || null;
    const key =
      kind === 'region'
        ? region || 'Unknown'
        : [publisherPlatform, platformPosition, impressionDevice].filter(Boolean).join(' · ') ||
          'Unknown';
    const target = kind === 'region' ? regionRows : placementRows;
    const current = target.get(key) ?? {
      key,
      publisherPlatform,
      platformPosition,
      impressionDevice,
      region,
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      outboundClicks: 0,
      landingPageViews: 0,
      purchases: 0,
      purchaseValue: 0,
    };
    const spendEur = numeric(row.spend_eur);
    current.spendEur += spendEur;
    current.adCostDzd += spendEur * (fxByDay.get(String(row.day)) ?? economics.settings.fxRate);
    current.impressions += numeric(row.impressions);
    current.outboundClicks += numeric(row.outbound_clicks);
    current.landingPageViews += numeric(row.landing_page_views);
    current.purchases += numeric(row.purchases);
    current.purchaseValue += numeric(row.purchase_value);
    target.set(key, current);
  }
  const finalizeBreakdown = (row: BreakdownAccumulator) => ({
    ...row,
    outboundCtrPct: ratio(row.outboundClicks, row.impressions),
    landingViewRatePct: ratio(row.landingPageViews, row.outboundClicks),
    cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
  });
  const budgetRows = Array.from(budgetsResult.rows as Iterable<unknown>, (raw) => {
    const row = raw as Record<string, unknown>;
    const dailyBudgetEur = nullableNumeric(row.daily_budget_eur);
    const todaySpendEur = numeric(row.today_spend_eur);
    return {
      campaignId: String(row.campaign_id),
      campaignName: String(row.campaign_name || row.campaign_id),
      effectiveStatus: row.effective_status ? String(row.effective_status) : null,
      dailyBudgetEur,
      budgetRemainingEur: nullableNumeric(row.budget_remaining_eur),
      todaySpendEur,
      pacePct: dailyBudgetEur && dailyBudgetEur > 0 ? (todaySpendEur / dailyBudgetEur) * 100 : null,
      syncedAt: isoValue(row.synced_at),
    };
  });
  return {
    placements: [...placementRows.values()]
      .map(finalizeBreakdown)
      .sort((left, right) => right.spendEur - left.spendEur),
    regions: [...regionRows.values()]
      .map(finalizeBreakdown)
      .sort((left, right) => right.spendEur - left.spendEur),
    budgets: budgetRows,
    maturation: Array.from(maturationResult.rows as Iterable<unknown>, (raw) => {
      const row = raw as Record<string, unknown>;
      const ordersCount = numeric(row.orders);
      return {
        campaignId: String(row.campaign_id),
        orders: ordersCount,
        terminal: numeric(row.terminal),
        points: [
          { day: 0, paidRatePct: ratio(numeric(row.paid_d0), numeric(row.eligible_d0)) },
          { day: 3, paidRatePct: ratio(numeric(row.paid_d3), numeric(row.eligible_d3)) },
          { day: 7, paidRatePct: ratio(numeric(row.paid_d7), numeric(row.eligible_d7)) },
          { day: 14, paidRatePct: ratio(numeric(row.paid_d14), numeric(row.eligible_d14)) },
          { day: 21, paidRatePct: ratio(numeric(row.paid_d21), numeric(row.eligible_d21)) },
        ],
        maturityPct: ratio(numeric(row.terminal), numeric(row.eligible_d21)),
      };
    }),
  };
}
