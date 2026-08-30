import { sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  analyticsEconomicsDailyFacts,
  metaAdsDailyInsights,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

import { loadAutomaticPaidEconomics, resolveAnalyticsFilters } from './analytics';
import {
  ANALYTICS_FACT_SEMANTICS_VERSION,
  ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE,
} from './analytics-fact-contract';
import { effectiveEcotrackStatusSql } from './ecotrack-status-policy';
import { getProfitTrackerReport } from './profit-tracker';

type Database = ReturnType<typeof getDb>;

function decimal(value: number | null) {
  return value == null ? null : value.toFixed(6);
}

function dayInAlgiers(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

type EconomicsReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;
type AutomaticPaidEconomics = Awaited<ReturnType<typeof loadAutomaticPaidEconomics>>;

export function resolveAnalyticsFactRefreshFilters(
  options: { startDate?: string | null; endDate?: string },
  now: Date,
) {
  const endDate = options.endDate ?? dayInAlgiers(now);
  const resolved = resolveAnalyticsFilters(
    options.startDate
      ? { view: 'money', range: 'custom', startDate: options.startDate, endDate }
      : { view: 'money', range: 'all' },
    now,
  );
  return options.endDate ? { ...resolved, endDate: options.endDate } : resolved;
}

export function buildAnalyticsEconomicsDailyFactRows(
  report: EconomicsReport,
  automaticPaid: AutomaticPaidEconomics,
  now: Date,
) {
  const paidByDay = new Map(automaticPaid.days.map((day) => [day.date, day]));
  return report.days.map((day) => {
    const paid = paidByDay.get(day.date);
    const adjustedProfitDzd =
      day.metrics.adjustedProfitDzd ??
      (day.postedOrders === 0 && day.metrics.adCostDzd != null ? 0 : null);
    const netProfitDzd =
      adjustedProfitDzd == null || day.metrics.adCostDzd == null
        ? null
        : adjustedProfitDzd - day.metrics.adCostDzd;
    const trueProfitDzd = netProfitDzd == null ? null : netProfitDzd - (day.operatingCostDzd ?? 0);
    return {
      day: day.date,
      postedOrders: day.postedOrders,
      paidOrders: paid?.paidOrders ?? 0,
      costCompleteOrders: day.costCompleteOrders,
      paidProfitCompleteOrders: paid?.completeOrders ?? 0,
      grossProfitDzd: decimal(day.grossProfitDzd),
      adjustedProfitDzd: decimal(adjustedProfitDzd),
      adCostDzd: decimal(day.metrics.adCostDzd) ?? '0.000000',
      operatingCostDzd: decimal(day.operatingCostDzd) ?? '0.000000',
      netProfitDzd: decimal(netProfitDzd),
      trueProfitDzd: decimal(trueProfitDzd),
      automaticPaidCodDzd: decimal(paid?.codDzd ?? 0) ?? '0.000000',
      automaticPaidFeesDzd: decimal(paid?.feesDzd ?? 0) ?? '0.000000',
      automaticPaidProfitDzd: paid ? decimal(paid.profitDzd) : null,
      fxRateUsed: (day.fxRateUsed || report.settings.fxRate).toFixed(4),
      planningReturnRatePct: (day.returnRatePct ?? report.settings.defaultReturnRate).toFixed(4),
      semanticsVersion: ANALYTICS_FACT_SEMANTICS_VERSION,
      refreshedAt: now,
    };
  });
}

export function buildAnalyticsOrderCohortOutcomeSql(endDate: string) {
  return effectiveEcotrackStatusSql({
    localStatus: orders.inHouseStatus,
    providerStatus: sql`state.current_status`,
    latestActivityAt: sql`lifecycle.latest_activity_at`,
    fallbackActivityAt: sql`coalesce(
      state.provider_created_at at time zone 'Africa/Algiers',
      first_posted.posted_at
    )`,
    referenceAt: sql`${endDate}::date + interval '1 day'`,
  });
}

export async function refreshAnalyticsFacts(
  options: {
    db?: Database;
    startDate?: string | null;
    endDate?: string;
    now?: Date;
  } = {},
) {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const sourceCutoffResult = options.endDate
    ? null
    : await db.execute(sql`
        select to_char(least(
          (select max((${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date)
            from ${orderStatusHistory} where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}),
          (select max(${metaAdsDailyInsights.day}) from ${metaAdsDailyInsights})
        ), 'YYYY-MM-DD') as end_date
      `);
  const sourceCutoff = sourceCutoffResult
    ? (sourceCutoffResult.rows[0] as { end_date?: unknown } | undefined)?.end_date
    : null;
  const filters = resolveAnalyticsFactRefreshFilters(
    {
      ...options,
      endDate: options.endDate ?? (typeof sourceCutoff === 'string' ? sourceCutoff : undefined),
    },
    now,
  );
  const report = await getProfitTrackerReport(
    filters.startDate
      ? { range: 'custom', startDate: filters.startDate, endDate: filters.endDate }
      : { range: 'all', endDate: filters.endDate },
    { db },
  );
  const automaticPaid = await loadAutomaticPaidEconomics(
    db,
    filters,
    report.settings.defaultReturnRate === 100,
  );
  const dailyRows = buildAnalyticsEconomicsDailyFactRows(report, automaticPaid, now);

  await db.transaction(async (tx) => {
    for (let offset = 0; offset < dailyRows.length; offset += 500) {
      const batch = dailyRows.slice(offset, offset + 500);
      if (!batch.length) continue;
      await tx
        .insert(analyticsEconomicsDailyFacts)
        .values(batch)
        .onConflictDoUpdate({
          target: analyticsEconomicsDailyFacts.day,
          set: {
            postedOrders: sql`excluded.posted_orders`,
            paidOrders: sql`excluded.paid_orders`,
            costCompleteOrders: sql`excluded.cost_complete_orders`,
            paidProfitCompleteOrders: sql`excluded.paid_profit_complete_orders`,
            grossProfitDzd: sql`excluded.gross_profit_dzd`,
            adjustedProfitDzd: sql`excluded.adjusted_profit_dzd`,
            adCostDzd: sql`excluded.ad_cost_dzd`,
            operatingCostDzd: sql`excluded.operating_cost_dzd`,
            netProfitDzd: sql`excluded.net_profit_dzd`,
            trueProfitDzd: sql`excluded.true_profit_dzd`,
            automaticPaidCodDzd: sql`excluded.automatic_paid_cod_dzd`,
            automaticPaidFeesDzd: sql`excluded.automatic_paid_fees_dzd`,
            automaticPaidProfitDzd: sql`excluded.automatic_paid_profit_dzd`,
            fxRateUsed: sql`excluded.fx_rate_used`,
            planningReturnRatePct: sql`excluded.planning_return_rate_pct`,
            semanticsVersion: sql`excluded.semantics_version`,
            refreshedAt: sql`excluded.refreshed_at`,
          },
        });
    }

    await tx.execute(sql`
      insert into admin.analytics_order_cohort_facts (
        order_id, posted_day, delivered_at, paid_at, outcome,
        submitted_cod_dzd, current_cod_dzd, delivery_fee_dzd,
        product_cost_dzd, gross_profit_dzd, automatic_paid_profit_dzd,
        cost_complete, wilaya_id, commune, delivery_mode, attempt_count,
        meta_campaign_id, meta_adset_id, meta_ad_id, semantics_version, refreshed_at
      )
      with first_posted as (
        select distinct on (order_id)
          order_id,
          (changed_at at time zone 'Africa/Algiers')::date as posted_day,
          changed_at at time zone 'Africa/Algiers' as posted_at
        from order_status_history
        where status = ${ORDER_STATUS.POSTED}
        order by order_id, changed_at asc
      ), lifecycle as (
        select order_id,
          min(event_date::timestamp + nullif(event_time, '')::time)
            filter (where status = 'livred') as delivered_at,
          min(event_date::timestamp + nullif(event_time, '')::time)
            filter (where status = 'payed') as paid_at,
          max(event_date::timestamp + nullif(event_time, '')::time) as latest_activity_at,
          count(*) filter (where status = 'attempt_delivery')::int as attempts
        from admin.ecotrack_order_tracking_events
        group by order_id
      ), line_economics as (
        select order_id,
          bool_and(unit_purchase_price_snapshot is not null and line_total is not null)
            as cost_complete,
          sum(line_total)::double precision as product_revenue,
          sum(unit_purchase_price_snapshot * quantity)::double precision as product_cost,
          sum(
            line_total - coalesce(
              unit_purchase_price_snapshot * quantity,
              line_total * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
            )
          )::double precision as gross_profit
        from order_line_items
        group by order_id
      )
      select first_posted.order_id,
        first_posted.posted_day,
        lifecycle.delivered_at,
        lifecycle.paid_at,
        ${buildAnalyticsOrderCohortOutcomeSql(filters.endDate)},
        orders.total_amount,
        state.current_amount,
        coalesce(state.delivery_tariff, state.estimated_fee),
        case when line_economics.cost_complete then line_economics.product_cost end,
        line_economics.gross_profit,
        case when state.current_status in ('paye_et_archive', 'payed')
          and coalesce(state.current_amount, orders.total_amount) is not null
          and coalesce(state.delivery_tariff, state.estimated_fee) is not null
        then coalesce(state.current_amount, orders.total_amount)
          - coalesce(state.delivery_tariff, state.estimated_fee)
          - case when line_economics.cost_complete then line_economics.product_cost
            else coalesce(
              line_economics.product_revenue * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE},
              coalesce(state.current_amount, orders.total_amount)
                * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
            ) end
        end,
        coalesce(line_economics.cost_complete, false),
        orders.state,
        nullif(trim(orders.city), ''),
        case when state.stop_desk then 'stop_desk' else 'home' end,
        coalesce(lifecycle.attempts, 0),
        attribution.meta_campaign_id,
        attribution.meta_adset_id,
        attribution.meta_ad_id,
        ${ANALYTICS_FACT_SEMANTICS_VERSION},
        ${now}
      from first_posted
      inner join orders on orders.id = first_posted.order_id
      left join admin.ecotrack_order_states state
        on state.order_id = first_posted.order_id and state.deleted_at is null
      left join lifecycle on lifecycle.order_id = first_posted.order_id
      left join line_economics on line_economics.order_id = first_posted.order_id
      left join order_acquisition_attribution attribution
        on attribution.order_id = first_posted.order_id
        and attribution.channel = 'meta_paid'
      where ${
        filters.startDate ? sql`first_posted.posted_day >= ${filters.startDate}::date and` : sql``
      }
        first_posted.posted_day <= ${filters.endDate}::date
      on conflict (order_id) do update set
        posted_day = excluded.posted_day,
        delivered_at = excluded.delivered_at,
        paid_at = excluded.paid_at,
        outcome = excluded.outcome,
        submitted_cod_dzd = excluded.submitted_cod_dzd,
        current_cod_dzd = excluded.current_cod_dzd,
        delivery_fee_dzd = excluded.delivery_fee_dzd,
        product_cost_dzd = excluded.product_cost_dzd,
        gross_profit_dzd = excluded.gross_profit_dzd,
        automatic_paid_profit_dzd = excluded.automatic_paid_profit_dzd,
        cost_complete = excluded.cost_complete,
        wilaya_id = excluded.wilaya_id,
        commune = excluded.commune,
        delivery_mode = excluded.delivery_mode,
        attempt_count = excluded.attempt_count,
        meta_campaign_id = excluded.meta_campaign_id,
        meta_adset_id = excluded.meta_adset_id,
        meta_ad_id = excluded.meta_ad_id,
        semantics_version = excluded.semantics_version,
        refreshed_at = excluded.refreshed_at
    `);
  });

  return { dailyFacts: dailyRows.length, cohortThrough: filters.endDate };
}

export async function refreshAnalyticsFactsAfterMutation() {
  try {
    await refreshAnalyticsFacts();
    return true;
  } catch (error) {
    console.error('Stats fact refresh failed after an economics mutation.', error);
    return false;
  }
}
