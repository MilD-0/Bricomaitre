import { sql } from 'drizzle-orm';

import {
  analyticsOrderCohortFacts,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  metaAdsDailyInsights,
  orderAcquisitionAttribution,
  orderLineItems,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import {
  CONFIRMED_LIFECYCLE_ORDER_STATUSES,
  ORDER_STATUS,
} from '@bric/storefront-core/order-domain';
import {
  ANALYTICS_FACT_SEMANTICS_VERSION,
  ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE,
} from '../analytics-fact-contract';
import type { AnalyticsEntityLevel, AnalyticsFilters } from './contract';
import { ratio } from './metrics';
import { datePredicate, numeric, timestampPredicate } from './query-values';
import {
  type AnalyticsMetaEntity,
  type Database,
  type EconomicsReport,
  stateAwareContributionSql,
} from './loaders-shared';

export { loadMetaBreakdowns } from './acquisition-breakdowns';

type MetaDailyRow = {
  day: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
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
  videoAverageWatchSeconds: number;
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
};

type MetaOutcomeRow = {
  campaignId: string | null;
  adsetId: string | null;
  adId: string;
  bricOrders: number;
  confirmedOrders: number;
  postedOrders: number;
  deliveredOrders: number;
  paidOrders: number;
  returnedOrders: number;
  attributionStartDate: string | null;
  projectedAdjustedProfitDzd: number;
  automaticPaidProfitDzd: number;
  profitCompleteOrders: number;
};

type MetaEntityAccumulator = Omit<
  AnalyticsMetaEntity,
  | 'ctrPct'
  | 'outboundCtrPct'
  | 'landingViewRatePct'
  | 'cpmEur'
  | 'videoPlayRatePct'
  | 'videoCompletionRatePct'
  | 'videoAverageWatchSeconds'
  | 'costPerPostedDzd'
  | 'costPerConfirmedDzd'
  | 'costPerDeliveredDzd'
  | 'costPerPaidDzd'
  | 'platformRoas'
  | 'outcomeSpendCoveragePct'
  | 'projectedProfitX'
  | 'paidProfitX'
  | 'profitCoveragePct'
> & { videoWatchSecondsWeighted: number };

function emptyMetaEntity(
  level: AnalyticsEntityLevel,
  row: Pick<
    MetaDailyRow,
    'campaignId' | 'campaignName' | 'adsetId' | 'adsetName' | 'adId' | 'adName'
  >,
): MetaEntityAccumulator {
  const id = level === 'campaign' ? row.campaignId : level === 'adset' ? row.adsetId : row.adId;
  const name =
    level === 'campaign' ? row.campaignName : level === 'adset' ? row.adsetName : row.adName;
  return {
    id,
    name: name || id,
    campaignId: row.campaignId || null,
    campaignName: row.campaignName || null,
    adsetId: level === 'campaign' ? null : row.adsetId || null,
    adsetName: level === 'campaign' ? null : row.adsetName || null,
    spendEur: 0,
    adCostDzd: 0,
    impressions: 0,
    clicks: 0,
    linkClicks: 0,
    outboundClicks: 0,
    uniqueOutboundClicks: 0,
    landingPageViews: 0,
    addToCarts: 0,
    checkouts: 0,
    metaPurchases: 0,
    purchaseValue: 0,
    videoPlays: 0,
    videoP25Watched: 0,
    videoP50Watched: 0,
    videoP75Watched: 0,
    videoP95Watched: 0,
    videoP100Watched: 0,
    videoWatchSecondsWeighted: 0,
    qualityRanking: null,
    engagementRateRanking: null,
    conversionRateRanking: null,
    bricOrders: 0,
    confirmedOrders: 0,
    postedOrders: 0,
    deliveredOrders: 0,
    paidOrders: 0,
    returnedOrders: 0,
    attributedAdCostDzd: 0,
    projectedAdjustedProfitDzd: 0,
    automaticPaidProfitDzd: 0,
    profitCompleteOrders: 0,
  };
}

function finalizeMetaEntity(row: MetaEntityAccumulator): AnalyticsMetaEntity {
  const { videoWatchSecondsWeighted, ...publicRow } = row;
  return {
    ...publicRow,
    ctrPct: row.impressions > 0 ? (row.linkClicks / row.impressions) * 100 : null,
    outboundCtrPct: row.impressions > 0 ? (row.outboundClicks / row.impressions) * 100 : null,
    landingViewRatePct:
      row.outboundClicks > 0 ? (row.landingPageViews / row.outboundClicks) * 100 : null,
    cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
    videoPlayRatePct: row.impressions > 0 ? (row.videoPlays / row.impressions) * 100 : null,
    videoCompletionRatePct:
      row.videoPlays > 0 ? (row.videoP100Watched / row.videoPlays) * 100 : null,
    videoAverageWatchSeconds:
      row.videoPlays > 0 ? videoWatchSecondsWeighted / row.videoPlays : null,
    costPerPostedDzd: row.postedOrders > 0 ? row.attributedAdCostDzd / row.postedOrders : null,
    costPerConfirmedDzd:
      row.confirmedOrders > 0 ? row.attributedAdCostDzd / row.confirmedOrders : null,
    costPerDeliveredDzd:
      row.deliveredOrders > 0 ? row.attributedAdCostDzd / row.deliveredOrders : null,
    costPerPaidDzd: row.paidOrders > 0 ? row.attributedAdCostDzd / row.paidOrders : null,
    platformRoas: row.spendEur > 0 ? row.purchaseValue / row.spendEur : null,
    outcomeSpendCoveragePct: ratio(row.attributedAdCostDzd, row.adCostDzd),
    projectedProfitX:
      row.attributedAdCostDzd > 0 ? row.projectedAdjustedProfitDzd / row.attributedAdCostDzd : null,
    paidProfitX:
      row.attributedAdCostDzd > 0 && row.paidOrders > 0
        ? row.automaticPaidProfitDzd / row.attributedAdCostDzd
        : null,
    profitCoveragePct: ratio(row.profitCompleteOrders, row.postedOrders),
  };
}

export function publicMetaEntity(row: AnalyticsMetaEntity) {
  return {
    id: row.id,
    name: row.name,
    campaignName: row.campaignName,
    spendEur: row.spendEur,
    adCostDzd: row.adCostDzd,
    impressions: row.impressions,
    outboundClicks: row.outboundClicks,
    uniqueOutboundClicks: row.uniqueOutboundClicks,
    landingPageViews: row.landingPageViews,
    metaPurchases: row.metaPurchases,
    videoPlays: row.videoPlays,
    videoAverageWatchSeconds: row.videoAverageWatchSeconds,
    qualityRanking: row.qualityRanking,
    engagementRateRanking: row.engagementRateRanking,
    conversionRateRanking: row.conversionRateRanking,
    bricOrders: row.bricOrders,
    confirmedOrders: row.confirmedOrders,
    postedOrders: row.postedOrders,
    deliveredOrders: row.deliveredOrders,
    paidOrders: row.paidOrders,
    returnedOrders: row.returnedOrders,
    outboundCtrPct: row.outboundCtrPct,
    landingViewRatePct: row.landingViewRatePct,
    videoCompletionRatePct: row.videoCompletionRatePct,
    costPerPostedDzd: row.costPerPostedDzd,
    costPerDeliveredDzd: row.costPerDeliveredDzd,
    costPerPaidDzd: row.costPerPaidDzd,
    attributedAdCostDzd: row.attributedAdCostDzd,
    outcomeSpendCoveragePct: row.outcomeSpendCoveragePct,
    projectedProfitX: row.projectedProfitX,
    paidProfitX: row.paidProfitX,
    profitCoveragePct: row.profitCoveragePct,
  };
}

function groupMetaEntities(
  level: AnalyticsEntityLevel,
  daily: MetaDailyRow[],
  outcomes: MetaOutcomeRow[],
) {
  const rows = new Map<string, MetaEntityAccumulator>();
  const namesByAdId = new Map(daily.map((row) => [row.adId, row]));
  const dailyByAdId = new Map<string, MetaDailyRow[]>();
  for (const row of daily) {
    const adRows = dailyByAdId.get(row.adId) ?? [];
    adRows.push(row);
    dailyByAdId.set(row.adId, adRows);
  }

  for (const day of daily) {
    const id = level === 'campaign' ? day.campaignId : level === 'adset' ? day.adsetId : day.adId;
    const current = rows.get(id) ?? emptyMetaEntity(level, day);
    current.spendEur += day.spendEur;
    current.adCostDzd += day.adCostDzd;
    current.impressions += day.impressions;
    current.clicks += day.clicks;
    current.linkClicks += day.linkClicks;
    current.outboundClicks += day.outboundClicks;
    current.uniqueOutboundClicks += day.uniqueOutboundClicks;
    current.landingPageViews += day.landingPageViews;
    current.addToCarts += day.addToCarts;
    current.checkouts += day.checkouts;
    current.metaPurchases += day.metaPurchases;
    current.purchaseValue += day.purchaseValue;
    current.videoPlays += day.videoPlays;
    current.videoP25Watched += day.videoP25Watched;
    current.videoP50Watched += day.videoP50Watched;
    current.videoP75Watched += day.videoP75Watched;
    current.videoP95Watched += day.videoP95Watched;
    current.videoP100Watched += day.videoP100Watched;
    current.videoWatchSecondsWeighted += day.videoAverageWatchSeconds * day.videoPlays;
    if (day.qualityRanking) current.qualityRanking = day.qualityRanking;
    if (day.engagementRateRanking) current.engagementRateRanking = day.engagementRateRanking;
    if (day.conversionRateRanking) current.conversionRateRanking = day.conversionRateRanking;
    rows.set(id, current);
  }

  for (const outcome of outcomes) {
    const id =
      level === 'campaign'
        ? outcome.campaignId
        : level === 'adset'
          ? outcome.adsetId
          : outcome.adId;
    if (!id) continue;
    const reference = namesByAdId.get(outcome.adId) ?? {
      campaignId: outcome.campaignId ?? '',
      campaignName: outcome.campaignId ?? '',
      adsetId: outcome.adsetId ?? '',
      adsetName: outcome.adsetId ?? '',
      adId: outcome.adId,
      adName: outcome.adId,
    };
    const current = rows.get(id) ?? emptyMetaEntity(level, reference);
    current.bricOrders += outcome.bricOrders;
    current.confirmedOrders += outcome.confirmedOrders;
    current.postedOrders += outcome.postedOrders;
    current.deliveredOrders += outcome.deliveredOrders;
    current.paidOrders += outcome.paidOrders;
    current.returnedOrders += outcome.returnedOrders;
    current.attributedAdCostDzd += (dailyByAdId.get(outcome.adId) ?? [])
      .filter((day) => !outcome.attributionStartDate || day.day >= outcome.attributionStartDate)
      .reduce((sum, day) => sum + day.adCostDzd, 0);
    current.projectedAdjustedProfitDzd += outcome.projectedAdjustedProfitDzd;
    current.automaticPaidProfitDzd += outcome.automaticPaidProfitDzd;
    current.profitCompleteOrders += outcome.profitCompleteOrders;
    rows.set(id, current);
  }

  return [...rows.values()]
    .map(finalizeMetaEntity)
    .sort((left, right) => right.spendEur - left.spendEur || right.bricOrders - left.bricOrders);
}

function buildMetaDailyByLevel(
  level: AnalyticsEntityLevel,
  daily: MetaDailyRow[],
  entities: AnalyticsMetaEntity[],
) {
  const topIds = new Set(entities.slice(0, 24).map((entity) => entity.id));
  const rows = new Map<
    string,
    {
      day: string;
      id: string;
      name: string;
      spendEur: number;
      adCostDzd: number;
      impressions: number;
      linkClicks: number;
      outboundClicks: number;
    }
  >();
  for (const source of daily) {
    const id =
      level === 'campaign' ? source.campaignId : level === 'adset' ? source.adsetId : source.adId;
    if (!topIds.has(id)) continue;
    const name =
      level === 'campaign'
        ? source.campaignName
        : level === 'adset'
          ? source.adsetName
          : source.adName;
    const key = `${source.day}\u0000${id}`;
    const current = rows.get(key) ?? {
      day: source.day,
      id,
      name: name || id,
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      linkClicks: 0,
      outboundClicks: 0,
    };
    current.spendEur += source.spendEur;
    current.adCostDzd += source.adCostDzd;
    current.impressions += source.impressions;
    current.linkClicks += source.linkClicks;
    current.outboundClicks += source.outboundClicks;
    rows.set(key, current);
  }
  return [...rows.values()]
    .map((row) => ({ day: row.day, id: row.id, name: row.name, adCostDzd: row.adCostDzd }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

export async function loadMetaPerformance(
  db: Database,
  filters: AnalyticsFilters,
  economics: EconomicsReport,
) {
  const confirmedStatuses = sql.join(
    [...CONFIRMED_LIFECYCLE_ORDER_STATUSES].map((status) => sql`${status}`),
    sql`, `,
  );
  const useMaterializedFacts = Boolean(
    (economics as EconomicsReport & { materializedFacts?: boolean }).materializedFacts,
  );
  const [spendResult, outcomeResult] = await Promise.all([
    db.execute(sql`
      select ${metaAdsDailyInsights.day}::text as day,
        ${metaAdsDailyInsights.campaignId} as campaign_id,
        max(${metaAdsDailyInsights.campaignName}) as campaign_name,
        ${metaAdsDailyInsights.adsetId} as adset_id,
        max(${metaAdsDailyInsights.adsetName}) as adset_name,
        ${metaAdsDailyInsights.adId} as ad_id,
        max(${metaAdsDailyInsights.adName}) as ad_name,
        coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision as spend_eur,
        coalesce(sum(${metaAdsDailyInsights.impressions}), 0)::double precision as impressions,
        coalesce(sum(${metaAdsDailyInsights.clicks}), 0)::double precision as clicks,
        coalesce(sum(${metaAdsDailyInsights.inlineLinkClicks}), 0)::double precision as link_clicks,
        coalesce(sum(${metaAdsDailyInsights.outboundClicks}), 0)::double precision
          as outbound_clicks,
        coalesce(sum(${metaAdsDailyInsights.uniqueOutboundClicks}), 0)::double precision
          as unique_outbound_clicks,
        coalesce(sum(${metaAdsDailyInsights.landingPageViews}), 0)::double precision
          as landing_page_views,
        coalesce(sum(${metaAdsDailyInsights.addToCarts}), 0)::double precision as add_to_carts,
        coalesce(sum(${metaAdsDailyInsights.initiateCheckouts}), 0)::double precision as checkouts,
        coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision as meta_purchases,
        coalesce(sum(${metaAdsDailyInsights.purchaseValue}), 0)::double precision
          as purchase_value,
        coalesce(sum(${metaAdsDailyInsights.videoPlays}), 0)::double precision as video_plays,
        coalesce(sum(${metaAdsDailyInsights.videoP25Watched}), 0)::double precision
          as video_p25_watched,
        coalesce(sum(${metaAdsDailyInsights.videoP50Watched}), 0)::double precision
          as video_p50_watched,
        coalesce(sum(${metaAdsDailyInsights.videoP75Watched}), 0)::double precision
          as video_p75_watched,
        coalesce(sum(${metaAdsDailyInsights.videoP95Watched}), 0)::double precision
          as video_p95_watched,
        coalesce(sum(${metaAdsDailyInsights.videoP100Watched}), 0)::double precision
          as video_p100_watched,
        case when sum(${metaAdsDailyInsights.videoPlays}) > 0 then
          sum(
            ${metaAdsDailyInsights.videoAverageWatchSeconds}
            * ${metaAdsDailyInsights.videoPlays}
          ) / sum(${metaAdsDailyInsights.videoPlays})
        else 0 end::double precision as video_average_watch_seconds,
        max(${metaAdsDailyInsights.qualityRanking}) as quality_ranking,
        max(${metaAdsDailyInsights.engagementRateRanking}) as engagement_rate_ranking,
        max(${metaAdsDailyInsights.conversionRateRanking}) as conversion_rate_ranking
      from ${metaAdsDailyInsights}
      where ${datePredicate(metaAdsDailyInsights.day, filters.startDate, filters.endDate)}
      group by ${metaAdsDailyInsights.day}, ${metaAdsDailyInsights.campaignId},
        ${metaAdsDailyInsights.adsetId}, ${metaAdsDailyInsights.adId}
      order by ${metaAdsDailyInsights.day}, sum(${metaAdsDailyInsights.spend}) desc
    `),
    useMaterializedFacts
      ? db.execute(sql`
          select max(${orderAcquisitionAttribution.metaCampaignId}) as campaign_id,
            max(${orderAcquisitionAttribution.metaAdsetId}) as adset_id,
            ${orderAcquisitionAttribution.metaAdId} as ad_id,
            count(*)::int as bric_orders,
            count(*) filter (where ${orders.inHouseStatus} in (${confirmedStatuses}))::int
              as confirmed_orders,
            count(${analyticsOrderCohortFacts.orderId})::int as posted_orders,
            count(${analyticsOrderCohortFacts.deliveredAt})::int as delivered_orders,
            count(*) filter (
              where ${analyticsOrderCohortFacts.outcome} in ('paye_et_archive', 'payed')
            )::int as paid_orders,
            count(*) filter (
              where ${analyticsOrderCohortFacts.outcome} = 'retour_archive'
            )::int as returned_orders,
            min((${orderAcquisitionAttribution.capturedAt}
              at time zone 'Africa/Algiers')::date)::text as attribution_start_date,
            coalesce(sum(${stateAwareContributionSql({
              grossProfit: analyticsOrderCohortFacts.grossProfitDzd,
              currentStatus: analyticsOrderCohortFacts.outcome,
              deliveredAt: analyticsOrderCohortFacts.deliveredAt,
              planningReturnRatePct: sql`${economics.settings.defaultReturnRate}`,
            })}) filter (
              where ${analyticsOrderCohortFacts.grossProfitDzd} is not null
            ), 0)::double precision
              as projected_adjusted_profit,
            case when ${economics.settings.defaultReturnRate}::double precision = 100 then 0 else
              coalesce(sum(
                ${analyticsOrderCohortFacts.automaticPaidProfitDzd}::double precision
              ), 0)::double precision end as automatic_paid_profit,
            count(*) filter (where ${analyticsOrderCohortFacts.costComplete})::int
              as profit_complete_orders
          from ${orderAcquisitionAttribution}
          inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
          left join ${analyticsOrderCohortFacts}
            on ${analyticsOrderCohortFacts.orderId} = ${orders.id}
            and ${analyticsOrderCohortFacts.semanticsVersion}
              = ${ANALYTICS_FACT_SEMANTICS_VERSION}
          where ${orderAcquisitionAttribution.channel} = 'meta_paid'
            and ${orderAcquisitionAttribution.metaAdId} is not null
            and ${timestampPredicate(
              orderAcquisitionAttribution.capturedAt,
              filters.startDate,
              filters.endDate,
            )}
          group by ${orderAcquisitionAttribution.metaAdId}
        `)
      : db.execute(sql`
      with first_posted as (
        select distinct on (${orderStatusHistory.orderId})
          ${orderStatusHistory.orderId} as order_id
        from ${orderStatusHistory}
        where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
        order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
      ), delivered as (
        select distinct ${ecotrackOrderTrackingEvents.orderId} as order_id
        from ${ecotrackOrderTrackingEvents}
        where ${ecotrackOrderTrackingEvents.status} = 'livred'
      ), line_economics as (
        select ${orderLineItems.orderId} as order_id,
          bool_and(
            ${orderLineItems.unitPurchasePriceSnapshot} is not null
            and ${orderLineItems.lineTotal} is not null
          ) as cost_complete,
          sum(${orderLineItems.lineTotal})::double precision as product_revenue,
          sum(
            coalesce(
              ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity},
              ${orderLineItems.lineTotal} * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
            )
          )::double precision as estimated_product_cost,
          sum(
            ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity}
          )::double precision as exact_product_cost
        from ${orderLineItems}
        group by ${orderLineItems.orderId}
      )
      select max(${orderAcquisitionAttribution.metaCampaignId}) as campaign_id,
        max(${orderAcquisitionAttribution.metaAdsetId}) as adset_id,
        ${orderAcquisitionAttribution.metaAdId} as ad_id,
        count(*)::int as bric_orders,
        count(*) filter (where ${orders.inHouseStatus} in (${confirmedStatuses}))::int
          as confirmed_orders,
        count(first_posted.order_id)::int as posted_orders,
        count(delivered.order_id)::int as delivered_orders,
        count(*) filter (
          where ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
        )::int
          as paid_orders,
        count(*) filter (where ${ecotrackOrderStates.currentStatus} = 'retour_archive')::int
          as returned_orders,
        min((${orderAcquisitionAttribution.capturedAt}
          at time zone 'Africa/Algiers')::date)::text as attribution_start_date,
        coalesce(sum(${stateAwareContributionSql({
          grossProfit: sql`line_economics.product_revenue
            - line_economics.estimated_product_cost`,
          currentStatus: ecotrackOrderStates.currentStatus,
          deliveredAt: sql`delivered.order_id`,
          planningReturnRatePct: sql`${economics.settings.defaultReturnRate}`,
        })}) filter (
          where first_posted.order_id is not null
            and line_economics.product_revenue is not null
        ), 0)::double precision as projected_adjusted_profit,
        case when ${economics.settings.defaultReturnRate}::double precision = 100 then 0 else
          coalesce(sum(
          coalesce(
            ${ecotrackOrderStates.currentAmount}::double precision,
            ${orders.totalAmount}::double precision
          )
          - coalesce(
            ${ecotrackOrderStates.deliveryTariff}::double precision,
            ${ecotrackOrderStates.estimatedFee}::double precision
          )
          - case when line_economics.cost_complete then line_economics.exact_product_cost
          else coalesce(
            line_economics.product_revenue
              * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE},
            coalesce(
              ${ecotrackOrderStates.currentAmount}::double precision,
              ${orders.totalAmount}::double precision
            ) * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
          ) end
          ) filter (
          where ${ecotrackOrderStates.currentStatus} in ('paye_et_archive', 'payed')
            and coalesce(
              ${ecotrackOrderStates.deliveryTariff},
              ${ecotrackOrderStates.estimatedFee}
            ) is not null
          ), 0)::double precision end as automatic_paid_profit,
        count(*) filter (
          where first_posted.order_id is not null and line_economics.cost_complete
        )::int as profit_complete_orders
      from ${orderAcquisitionAttribution}
      inner join ${orders} on ${orders.id} = ${orderAcquisitionAttribution.orderId}
      left join first_posted on first_posted.order_id = ${orders.id}
      left join delivered on delivered.order_id = ${orders.id}
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = ${orders.id}
        and ${ecotrackOrderStates.deletedAt} is null
      left join line_economics on line_economics.order_id = ${orders.id}
      where ${orderAcquisitionAttribution.channel} = 'meta_paid'
        and ${orderAcquisitionAttribution.metaAdId} is not null
        and ${timestampPredicate(
          orderAcquisitionAttribution.capturedAt,
          filters.startDate,
          filters.endDate,
        )}
      group by ${orderAcquisitionAttribution.metaAdId}
    `),
  ]);
  const fxByDay = new Map(
    economics.days.map((day) => [day.date, day.fxRateUsed || economics.settings.fxRate]),
  );
  const daily = spendResult.rows.map((raw: unknown): MetaDailyRow => {
    const row = raw as Record<string, unknown>;
    const day = String(row.day);
    const spendEur = numeric(row.spend_eur);
    return {
      day,
      campaignId: String(row.campaign_id),
      campaignName: String(row.campaign_name || row.campaign_id),
      adsetId: String(row.adset_id),
      adsetName: String(row.adset_name || row.adset_id),
      adId: String(row.ad_id),
      adName: String(row.ad_name || row.ad_id),
      spendEur,
      adCostDzd: spendEur * (fxByDay.get(day) ?? economics.settings.fxRate),
      impressions: numeric(row.impressions),
      clicks: numeric(row.clicks),
      linkClicks: numeric(row.link_clicks),
      outboundClicks: numeric(row.outbound_clicks),
      uniqueOutboundClicks: numeric(row.unique_outbound_clicks),
      landingPageViews: numeric(row.landing_page_views),
      addToCarts: numeric(row.add_to_carts),
      checkouts: numeric(row.checkouts),
      metaPurchases: numeric(row.meta_purchases),
      purchaseValue: numeric(row.purchase_value),
      videoPlays: numeric(row.video_plays),
      videoP25Watched: numeric(row.video_p25_watched),
      videoP50Watched: numeric(row.video_p50_watched),
      videoP75Watched: numeric(row.video_p75_watched),
      videoP95Watched: numeric(row.video_p95_watched),
      videoP100Watched: numeric(row.video_p100_watched),
      videoAverageWatchSeconds: numeric(row.video_average_watch_seconds),
      qualityRanking: row.quality_ranking ? String(row.quality_ranking) : null,
      engagementRateRanking: row.engagement_rate_ranking
        ? String(row.engagement_rate_ranking)
        : null,
      conversionRateRanking: row.conversion_rate_ranking
        ? String(row.conversion_rate_ranking)
        : null,
    };
  });
  const outcomes = outcomeResult.rows.map((raw: unknown): MetaOutcomeRow => {
    const row = raw as Record<string, unknown>;
    return {
      campaignId: row.campaign_id ? String(row.campaign_id) : null,
      adsetId: row.adset_id ? String(row.adset_id) : null,
      adId: String(row.ad_id),
      bricOrders: numeric(row.bric_orders),
      confirmedOrders: numeric(row.confirmed_orders),
      postedOrders: numeric(row.posted_orders),
      deliveredOrders: numeric(row.delivered_orders),
      paidOrders: numeric(row.paid_orders),
      returnedOrders: numeric(row.returned_orders),
      attributionStartDate: row.attribution_start_date ? String(row.attribution_start_date) : null,
      projectedAdjustedProfitDzd: numeric(row.projected_adjusted_profit),
      automaticPaidProfitDzd: numeric(row.automatic_paid_profit),
      profitCompleteOrders: numeric(row.profit_complete_orders),
    };
  });
  const campaigns = groupMetaEntities('campaign', daily, outcomes);
  const adsets = groupMetaEntities('adset', daily, outcomes);
  const ads = groupMetaEntities('ad', daily, outcomes);
  const total = ads.reduce(
    (summary, row) => {
      summary.spendEur += row.spendEur;
      summary.adCostDzd += row.adCostDzd;
      summary.impressions += row.impressions;
      summary.clicks += row.clicks;
      summary.linkClicks += row.linkClicks;
      summary.outboundClicks += row.outboundClicks;
      summary.uniqueOutboundClicks += row.uniqueOutboundClicks;
      summary.landingPageViews += row.landingPageViews;
      summary.addToCarts += row.addToCarts;
      summary.checkouts += row.checkouts;
      summary.metaPurchases += row.metaPurchases;
      summary.purchaseValue += row.purchaseValue;
      summary.videoPlays += row.videoPlays;
      summary.videoP25Watched += row.videoP25Watched;
      summary.videoP50Watched += row.videoP50Watched;
      summary.videoP75Watched += row.videoP75Watched;
      summary.videoP95Watched += row.videoP95Watched;
      summary.videoP100Watched += row.videoP100Watched;
      summary.videoWatchSecondsWeighted += (row.videoAverageWatchSeconds ?? 0) * row.videoPlays;
      summary.bricOrders += row.bricOrders;
      summary.confirmedOrders += row.confirmedOrders;
      summary.postedOrders += row.postedOrders;
      summary.deliveredOrders += row.deliveredOrders;
      summary.paidOrders += row.paidOrders;
      summary.returnedOrders += row.returnedOrders;
      return summary;
    },
    {
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      outboundClicks: 0,
      uniqueOutboundClicks: 0,
      landingPageViews: 0,
      addToCarts: 0,
      checkouts: 0,
      metaPurchases: 0,
      purchaseValue: 0,
      videoPlays: 0,
      videoP25Watched: 0,
      videoP50Watched: 0,
      videoP75Watched: 0,
      videoP95Watched: 0,
      videoP100Watched: 0,
      videoWatchSecondsWeighted: 0,
      bricOrders: 0,
      confirmedOrders: 0,
      postedOrders: 0,
      deliveredOrders: 0,
      paidOrders: 0,
      returnedOrders: 0,
    },
  );

  const { videoWatchSecondsWeighted, ...publicTotal } = total;
  return {
    summary: {
      ...publicTotal,
      ctrPct: total.impressions > 0 ? (total.linkClicks / total.impressions) * 100 : null,
      outboundCtrPct:
        total.impressions > 0 ? (total.outboundClicks / total.impressions) * 100 : null,
      landingViewRatePct:
        total.outboundClicks > 0 ? (total.landingPageViews / total.outboundClicks) * 100 : null,
      cpmEur: total.impressions > 0 ? (total.spendEur / total.impressions) * 1_000 : null,
      videoPlayRatePct: total.impressions > 0 ? (total.videoPlays / total.impressions) * 100 : null,
      videoCompletionRatePct:
        total.videoPlays > 0 ? (total.videoP100Watched / total.videoPlays) * 100 : null,
      videoAverageWatchSeconds:
        total.videoPlays > 0 ? videoWatchSecondsWeighted / total.videoPlays : null,
      costPerPostedDzd: total.postedOrders > 0 ? total.adCostDzd / total.postedOrders : null,
      costPerConfirmedDzd:
        total.confirmedOrders > 0 ? total.adCostDzd / total.confirmedOrders : null,
      costPerDeliveredDzd:
        total.deliveredOrders > 0 ? total.adCostDzd / total.deliveredOrders : null,
      costPerPaidDzd: total.paidOrders > 0 ? total.adCostDzd / total.paidOrders : null,
      platformRoas: total.spendEur > 0 ? total.purchaseValue / total.spendEur : null,
    },
    entities: {
      campaigns: campaigns.slice(0, 100),
      adsets: adsets.slice(0, 100),
      ads: ads.slice(0, 100),
    },
    daily: {
      campaigns: buildMetaDailyByLevel('campaign', daily, campaigns),
      adsets: buildMetaDailyByLevel('adset', daily, adsets),
      ads: buildMetaDailyByLevel('ad', daily, ads),
    },
    summaryDaily: aggregateMetaDaily(daily),
  };
}

function aggregateMetaDaily(
  rows: Array<{
    day: string;
    spendEur: number;
    adCostDzd: number;
    impressions: number;
    linkClicks: number;
    outboundClicks: number;
  }>,
) {
  const groups = new Map<
    string,
    {
      day: string;
      spendEur: number;
      adCostDzd: number;
      impressions: number;
      linkClicks: number;
      outboundClicks: number;
    }
  >();
  for (const row of rows) {
    const current = groups.get(row.day) ?? {
      day: row.day,
      spendEur: 0,
      adCostDzd: 0,
      impressions: 0,
      linkClicks: 0,
      outboundClicks: 0,
    };
    current.spendEur += row.spendEur;
    current.adCostDzd += row.adCostDzd;
    current.impressions += row.impressions;
    current.linkClicks += row.linkClicks;
    current.outboundClicks += row.outboundClicks;
    groups.set(row.day, current);
  }
  return [...groups.values()]
    .sort((left, right) => left.day.localeCompare(right.day))
    .map((row) => ({
      ...row,
      ctrPct: row.impressions > 0 ? (row.linkClicks / row.impressions) * 100 : null,
      outboundCtrPct: row.impressions > 0 ? (row.outboundClicks / row.impressions) * 100 : null,
      cpmEur: row.impressions > 0 ? (row.spendEur / row.impressions) * 1_000 : null,
    }));
}
