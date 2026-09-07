import { z } from 'zod';
import { sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { ecotrackOrderStates, orders, orderStatusHistory } from '@bric/db/schema';
import { getAiConfig } from '@bric/ai-core';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

import {
  analyticsQuerySchema,
  getAnalyticsData,
  type AnalyticsPayload,
  type AnalyticsQuery,
  type AnalyticsView,
} from './analytics';
import { analyticsMetricsForAssistant } from './admin-ai-analytics-contract';
import {
  adminAiAnalyticsFocusSchemaForView,
  focusAnalyticsForAssistant,
  type AdminAiAnalyticsFocus,
} from './admin-ai-analytics-focus';
import { adminAiDateScopeSchema, canonicalAdminAiDateQuery } from './admin-ai-date-scope';

type AdminAiAnalyticsLimits = {
  arrayLimit?: number;
  stringLimit?: number;
  maxDepth?: number;
};

type AnalyticsTruncation = {
  path: string;
  available: number;
  included: number;
};

function compactAnalyticsValue(
  value: unknown,
  limits: AdminAiAnalyticsLimits,
  truncations: AnalyticsTruncation[],
  path = 'data',
  depth = 0,
): unknown {
  if (limits.maxDepth !== undefined && depth > limits.maxDepth) return '[nested data omitted]';
  if (typeof value === 'string' && limits.stringLimit && value.length > limits.stringLimit) {
    return `${value.slice(0, Math.max(0, limits.stringLimit - 1))}…`;
  }
  if (Array.isArray(value)) {
    const selected = limits.arrayLimit ? value.slice(0, limits.arrayLimit) : value;
    if (selected.length < value.length) {
      truncations.push({ path, available: value.length, included: selected.length });
    }
    return selected.map((item, index) =>
      compactAnalyticsValue(item, limits, truncations, `${path}[${index}]`, depth + 1),
    );
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        compactAnalyticsValue(item, limits, truncations, `${path}.${key}`, depth + 1),
      ]),
    );
  }
  return value;
}

export function analyticsForAssistant(
  payload: AnalyticsPayload,
  focus?: AdminAiAnalyticsFocus,
  limits: AdminAiAnalyticsLimits = {},
) {
  const metrics = analyticsMetricsForAssistant(payload);
  const focusedDataset = focus ? focusAnalyticsForAssistant(payload, focus) : null;
  const truncations: AnalyticsTruncation[] = [];
  const hasConfiguredLimit = Object.values(limits).some((value) => value !== undefined);
  const data = hasConfiguredLimit
    ? compactAnalyticsValue(payload.data, limits, truncations)
    : payload.data;
  return {
    kind: 'analytics' as const,
    responseContractVersion: 6 as const,
    // Kept as a string for the current generic tool-result card. `view` is authoritative.
    query: payload.view,
    view: payload.view,
    filters: payload.filters,
    effectiveRanges: payload.effectiveRanges,
    metrics,
    focus: focusedDataset,
    generatedAt: payload.generatedAt,
    referenceDate: payload.referenceDate,
    reviewClock: payload.reviewClock,
    data,
    sources: payload.sources,
    warnings: payload.warnings,
    truncations,
    diagnostics: payload.diagnostics,
  };
}

const adminAiAnalyticsSourceCoverageSchema = z
  .object({
    source: z.literal('ecotrack'),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .optional()
  .describe(
    'Optional source-coverage drilldown. Use to explain the canonical EcoTrack coverage percentage or inspect its missing posted orders. It returns the exact denominator, gap reasons, and bounded missing-order rows.',
  );

function adminAiAnalyticsQuerySchemaForView<const View extends AnalyticsView>(view: View) {
  return z
    .object({
      view: z.literal(view),
      date: adminAiDateScopeSchema,
      grain: z
        .enum(['auto', 'day', 'week', 'month'])
        .default('auto')
        .describe('Time-series grain. Keep auto unless the operator requests a specific grain.'),
      focus: adminAiAnalyticsFocusSchemaForView(view)
        .optional()
        .describe('Optional underlying dataset valid for this Analytics workspace.'),
      sourceCoverage: adminAiAnalyticsSourceCoverageSchema,
    })
    .strict();
}

export const adminAiAnalyticsQuerySchema = z.discriminatedUnion('view', [
  adminAiAnalyticsQuerySchemaForView('command'),
  adminAiAnalyticsQuerySchemaForView('money'),
  adminAiAnalyticsQuerySchemaForView('acquisition'),
  adminAiAnalyticsQuerySchemaForView('fulfillment'),
  adminAiAnalyticsQuerySchemaForView('storefront'),
  adminAiAnalyticsQuerySchemaForView('search'),
  adminAiAnalyticsQuerySchemaForView('catalog'),
  adminAiAnalyticsQuerySchemaForView('assumptions'),
]);

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value == null ? null : String(value);
}

async function loadEcotrackSourceCoverage(input: {
  startDate: string | null;
  endDate: string;
  limit: number;
}) {
  const startCondition = input.startDate
    ? sql`and first_posted.posted_day >= ${input.startDate}::date`
    : sql``;
  const result = await getDb().execute(sql`
    with first_posted as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        ${orderStatusHistory.changedAt} as posted_at,
        (${orderStatusHistory.changedAt} at time zone 'Africa/Algiers')::date as posted_day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = ${ORDER_STATUS.POSTED}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), eligible as (
      select
        first_posted.order_id,
        first_posted.posted_at,
        first_posted.posted_day,
        ${orders.inHouseStatus} as local_status,
        ${orders.ecotrackReference} as local_reference,
        ${orders.ecotrackTrackingNumber} as local_tracking_number,
        active_state.id as active_state_id,
        any_state.id as any_state_id,
        any_state.deleted_at as state_deleted_at,
        case
          when active_state.id is not null then null
          when any_state.id is not null then 'deleted_state'
          when ${orders.ecotrackTrackingNumber} is not null then 'tracking_without_canonical_state'
          else 'no_canonical_state'
        end as gap_reason
      from first_posted
      inner join ${orders} on ${orders.id} = first_posted.order_id
      left join ${ecotrackOrderStates} active_state
        on active_state.order_id = first_posted.order_id and active_state.deleted_at is null
      left join ${ecotrackOrderStates} any_state on any_state.order_id = first_posted.order_id
      where first_posted.posted_day <= ${input.endDate}::date
      ${startCondition}
    ), gap_rows as (
      select * from eligible where active_state_id is null
    )
    select
      (select count(*)::int from eligible) as eligible_records,
      (select count(*)::int from eligible where active_state_id is not null) as covered_records,
      (select count(*)::int from gap_rows) as missing_records,
      (select min(posted_day)::text from eligible) as earliest_eligible_posted_date,
      (select max(posted_day)::text from eligible) as latest_eligible_posted_date,
      coalesce((
        select jsonb_object_agg(reason, count)
        from (
          select gap_reason as reason, count(*)::int as count
          from gap_rows
          group by gap_reason
        ) grouped_reasons
      ), '{}'::jsonb) as gap_reasons,
      coalesce((
        select jsonb_agg(to_jsonb(missing_order) order by missing_order."firstPostedAt" desc)
        from (
          select
            order_id as "orderId",
            posted_at as "firstPostedAt",
            local_status as "currentLocalStatus",
            local_reference as "localReference",
            local_tracking_number as "localTrackingNumber",
            gap_reason as "gapReason"
          from gap_rows
          order by posted_at desc
          limit ${input.limit}
        ) missing_order
      ), '[]'::jsonb) as missing_orders
  `);
  const row = (result.rows[0] ?? {}) as Record<string, unknown>;
  const eligibleRecords = numberValue(row.eligible_records);
  const coveredRecords = numberValue(row.covered_records);
  const missingRecords = numberValue(row.missing_records);
  const rawReasons =
    row.gap_reasons && typeof row.gap_reasons === 'object' && !Array.isArray(row.gap_reasons)
      ? (row.gap_reasons as Record<string, unknown>)
      : {};
  const rawOrders = Array.isArray(row.missing_orders) ? row.missing_orders : [];
  return {
    source: 'ecotrack' as const,
    definition: `EcoTrack coverage is posted orders with a non-deleted canonical EcoTrack state divided by all orders whose first local status-${ORDER_STATUS.POSTED} transition falls in the requested period.`,
    evidenceBasis:
      'Live canonical order status history and current EcoTrack state queried for this drilldown. The general Analytics source through-date does not shorten this separately queried eligible-order cohort.',
    requestedRange: { startDate: input.startDate, endDate: input.endDate },
    observedEligibleRange: {
      startDate: dateValue(row.earliest_eligible_posted_date),
      endDate: dateValue(row.latest_eligible_posted_date),
    },
    eligibleRecords,
    coveredRecords,
    missingRecords,
    coveragePct:
      eligibleRecords > 0 ? Number(((coveredRecords / eligibleRecords) * 100).toFixed(2)) : null,
    gapReasons: Object.entries(rawReasons).map(([reason, count]) => ({
      reason,
      count: numberValue(count),
    })),
    missingOrders: rawOrders.flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const order = value as Record<string, unknown>;
      return [
        {
          orderId: numberValue(order.orderId),
          firstPostedAt: dateValue(order.firstPostedAt),
          eligibilityReason: `The order has a recorded historical transition to local posted status ${ORDER_STATUS.POSTED} in the requested period.`,
          currentLocalStatus: numberValue(order.currentLocalStatus),
          localReference: order.localReference == null ? null : String(order.localReference),
          localTrackingNumber:
            order.localTrackingNumber == null ? null : String(order.localTrackingNumber),
          gapReason: String(order.gapReason ?? 'no_canonical_state'),
        },
      ];
    }),
    truncated: missingRecords > rawOrders.length,
  };
}

export async function queryAdminAnalytics(raw: unknown) {
  const { focus, sourceCoverage, date, ...queryOptions } = adminAiAnalyticsQuerySchema.parse(raw);
  const normalizedFocus = focus
    ? ({
        ...focus,
        search: focus.search,
        identifiers: focus.identifiers ?? [],
      } satisfies AdminAiAnalyticsFocus)
    : undefined;
  const query = analyticsQuerySchema.parse({
    ...queryOptions,
    ...canonicalAdminAiDateQuery(date),
  }) as AnalyticsQuery;
  const payload = await getAnalyticsData(query, {
    includeStorefrontDetails: query.view === 'storefront',
  });
  const config = getAiConfig();
  const result = analyticsForAssistant(payload, normalizedFocus, {
    arrayLimit: config.adminAnalyticsArrayLimit,
    stringLimit: config.adminAnalyticsStringLimit,
    maxDepth: config.adminAnalyticsMaxDepth,
  });
  if (!sourceCoverage) return result;
  return {
    ...result,
    sourceCoverage: await loadEcotrackSourceCoverage({
      startDate: payload.filters.startDate,
      endDate: payload.filters.endDate,
      limit: sourceCoverage.limit,
    }),
  };
}
