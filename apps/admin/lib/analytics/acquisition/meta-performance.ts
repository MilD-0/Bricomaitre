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
import { sql } from 'drizzle-orm';
import {
  ANALYTICS_FACT_SEMANTICS_VERSION,
  ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE,
} from '../../analytics-fact-contract';
import { effectiveEcotrackStatusSql } from '../../ecotrack-status-policy';
import type { AnalyticsFilters } from '../contract';
import { isMaterializedEconomicsReport } from '../economics-data';
import { type Database, type EconomicsReport, stateAwareContributionSql } from '../loaders-shared';
import { datePredicate, numeric, timestampPredicate } from '../query-values';
import { aggregateMetaDaily, buildMetaDailyByLevel } from './meta-daily';
import { type MetaDailyRow, type MetaOutcomeRow, groupMetaEntities } from './meta-entities';

export async function loadMetaPerformance(
  db: Database,
  filters: AnalyticsFilters,
  economics: EconomicsReport,
) {
  const confirmedStatuses = sql.join(
    [...CONFIRMED_LIFECYCLE_ORDER_STATUSES].map((status) => sql`${status}`),
    sql`, `,
  );
  const useMaterializedFacts = isMaterializedEconomicsReport(economics);
  const effectiveStatus = effectiveEcotrackStatusSql({
    localStatus: orders.inHouseStatus,
    providerStatus: ecotrackOrderStates.currentStatus,
    latestActivityAt: sql`lifecycle.latest_activity_at`,
    fallbackActivityAt: sql`coalesce(
      ${ecotrackOrderStates.providerCreatedAt} at time zone 'Africa/Algiers',
      first_posted.posted_at at time zone 'Africa/Algiers'
    )`,
    referenceAt: sql`${filters.endDate}::date + interval '1 day'`,
  });
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
          ${orderStatusHistory.orderId} as order_id,
          ${orderStatusHistory.changedAt} as posted_at
        from ${orderStatusHistory}
        where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
        order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
      ), lifecycle as (
        select ${ecotrackOrderTrackingEvents.orderId} as order_id,
          bool_or(${ecotrackOrderTrackingEvents.status} = 'livred') as delivered,
          max(${ecotrackOrderTrackingEvents.eventDate}::timestamp
            + coalesce(nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time, time '00:00'))
            as latest_activity_at
        from ${ecotrackOrderTrackingEvents}
        group by ${ecotrackOrderTrackingEvents.orderId}
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
        count(*) filter (where lifecycle.delivered)::int as delivered_orders,
        count(*) filter (
          where ${effectiveStatus} in ('paye_et_archive', 'payed')
        )::int
          as paid_orders,
        count(*) filter (where ${effectiveStatus} = 'retour_archive')::int
          as returned_orders,
        min((${orderAcquisitionAttribution.capturedAt}
          at time zone 'Africa/Algiers')::date)::text as attribution_start_date,
        coalesce(sum(${stateAwareContributionSql({
          grossProfit: sql`line_economics.product_revenue
            - line_economics.estimated_product_cost`,
          currentStatus: effectiveStatus,
          deliveredAt: sql`case when lifecycle.delivered then lifecycle.order_id end`,
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
          where ${effectiveStatus} in ('paye_et_archive', 'payed')
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
      left join lifecycle on lifecycle.order_id = ${orders.id}
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
