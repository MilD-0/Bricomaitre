import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { addDays, resolveAnalyticsFilters } from './analytics/date-range';
import { numeric, nullableNumeric, isoValue as isoTimestamp } from './analytics/query-values';
import { reportingDateSchema as dateOnlySchema, type AnalyticsFilters } from './analytics/contract';

import { getDb } from '@bric/db/client';
import {
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  metaAdsDailyInsights,
  orderLineItems,
  orders,
  orderStatusHistory,
  processedOrders,
  profitTrackerDays,
  profitTrackerOperatingCosts,
  profitTrackerSettings,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

import { runIdempotentAdminMutation } from './admin-mutation-idempotency';
import { ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE } from './analytics-fact-contract';
import { effectiveEcotrackStatusSql } from './ecotrack-status-policy';
import {
  applyProfitTrackerRollforward,
  buildProfitTrackerWeeks,
  operatingCostForDay,
  summarizeProfitTracker,
  type ProfitTrackerDayInput,
  type ProfitTrackerOperatingCost,
  type ProfitTrackerSettings,
} from './profit-tracker-metrics';

type Database = ReturnType<typeof getDb>;

const DEFAULT_SETTINGS: ProfitTrackerSettings = {
  fxRate: 280,
  defaultReturnRate: 10,
  restFrom: null,
};
const ANALYTICS_TIMEZONE = 'Africa/Algiers';

const nullableNonnegative = z.number().finite().nonnegative().nullable().optional();

export const profitTrackerRangeSchema = z
  .object({
    range: z.enum(['7d', '14d', '30d', '90d', 'year', 'all', 'custom']).default('30d'),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.range === 'custom' && (!value.startDate || !value.endDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Custom ranges require startDate and endDate.',
      });
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not follow endDate.',
      });
    }
  });

export const profitTrackerSettingsSchema = z.object({
  fxRate: z.number().finite().positive().max(100_000),
  defaultReturnRate: z.number().finite().min(0).max(100),
  restFrom: dateOnlySchema.nullable(),
});

export const profitTrackerDaySchema = z
  .object({
    date: dateOnlySchema,
    spendEur: nullableNonnegative,
    fbPurchases: nullableNonnegative,
    cpm: nullableNonnegative,
    ctr: z.number().finite().min(0).max(100).nullable().optional(),
    linkClicks: z.number().int().nonnegative().nullable().optional(),
    landingPageViews: nullableNonnegative,
    grossProfitDzd: z.number().finite().nullable().optional(),
    returnRatePct: z.number().finite().min(0).max(100).nullable().optional(),
    confirmedOrders: z.number().int().nonnegative().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const profitTrackerCostFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  amountDzd: z.number().finite().nonnegative().max(1_000_000_000_000),
  period: z.enum(['monthly', 'once']),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.nullable(),
});

export const profitTrackerCostPatchSchema = profitTrackerCostFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one cost change.');

export const profitTrackerCostSchema = profitTrackerCostFieldsSchema
  .extend({ endDate: dateOnlySchema.nullable().default(null) })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: 'custom',
        message: 'endDate must not precede startDate.',
        path: ['endDate'],
      });
    }
  });

export const profitTrackerCostCreateSchema = profitTrackerCostSchema.and(
  z.object({ requestId: z.uuid() }),
);

export type ProfitTrackerRangeInput = z.input<typeof profitTrackerRangeSchema>;
export type ProfitTrackerDayUpdate = z.infer<typeof profitTrackerDaySchema>;
export type ProfitTrackerMetaRow = {
  day: string;
  accountCurrency: string;
  spend: string | number;
  impressions: number;
  inlineLinkClicks: number;
  landingPageViews: string | number;
  purchases: string | number;
  syncedAt: Date;
};

export type ProfitTrackerMetaSyncRange = {
  since: string;
  until: string;
  accountCurrency: string;
  syncedAt: Date;
};

type AutomaticDayEconomics = {
  date: string;
  postedOrders: number;
  costCompleteOrders: number;
  grossProfitDzd: number | null;
  realizedGrossProfitDzd: number;
  returnExposedGrossProfitDzd: number;
  returnExposedOrders: number;
};

type OrderCohortDayEconomics = {
  date: string;
  orderCount: number;
  costCompleteOrders: number;
  grossProfitDzd: number | null;
  realizedGrossProfitDzd: number;
  returnExposedGrossProfitDzd: number;
  returnExposedOrders: number;
};

export type CanonicalOrderProjectionBasis = 'confirmed' | 'posted';

export type CanonicalOrderProjectionDay = {
  basis: CanonicalOrderProjectionBasis;
  reportDay: string;
  grossProfit: number | null;
  adSpend: number | null;
  estimatedReturnRate: number;
  estimatedReturnedOrders: number;
  estimatedReturnLoss: number | null;
  projectedProfit: number | null;
};

type MetaDayEconomics = {
  date: string;
  accountCurrency: string | null;
  spendEur: number;
  impressions: number;
  fbPurchases: number;
  cpm: number;
  ctr: number;
  linkClicks: number;
  landingPageViews: number;
  metaSyncedAt: string | null;
};

type RealizedDayEconomics = {
  date: string;
  settledOrders: number;
  amountCollectedDzd: number;
  netRevenueDzd: number;
  feesDzd: number;
  realizedProfitDzd: number;
};

export function resolveProfitTrackerDaySources({
  date,
  manual,
  automatic,
  meta,
  settings,
}: {
  date: string;
  manual?: ProfitTrackerDayInput;
  automatic?: AutomaticDayEconomics;
  meta?: MetaDayEconomics;
  settings: ProfitTrackerSettings;
}): ProfitTrackerDayInput {
  const grossProfitDzd = manual?.grossProfitDzd ?? automatic?.grossProfitDzd ?? null;
  const confirmedOrders = manual?.confirmedOrders ?? automatic?.postedOrders ?? null;
  const returnRatePct =
    grossProfitDzd == null ? null : (manual?.returnRatePct ?? settings.defaultReturnRate);
  const postedOrders = automatic?.postedOrders ?? 0;
  const costCompleteOrders = automatic?.costCompleteOrders ?? 0;
  const stateAdjustedProfitDzd =
    manual?.grossProfitDzd != null || grossProfitDzd == null || returnRatePct == null || !automatic
      ? undefined
      : stateAwareProjectedContribution({
          realizedGrossProfitDzd: automatic.realizedGrossProfitDzd,
          returnExposedGrossProfitDzd: automatic.returnExposedGrossProfitDzd,
          planningReturnRatePct: returnRatePct,
        });

  return {
    date,
    spendEur: meta?.spendEur ?? null,
    impressions: meta?.impressions ?? null,
    fbPurchases: meta?.fbPurchases ?? null,
    cpm: meta?.cpm ?? null,
    ctr: meta?.ctr ?? null,
    linkClicks: meta?.linkClicks ?? null,
    landingPageViews: meta?.landingPageViews ?? null,
    grossProfitDzd,
    returnRatePct,
    confirmedOrders,
    note: manual?.note ?? null,
    fxRateUsed: manual?.fxRateUsed ?? settings.fxRate,
    metaSyncedAt: meta?.metaSyncedAt ?? null,
    grossProfitSource:
      manual?.grossProfitDzd != null
        ? 'manual'
        : automatic?.grossProfitDzd != null
          ? 'automatic'
          : 'missing',
    returnRateSource:
      grossProfitDzd == null ? 'missing' : manual?.returnRatePct != null ? 'manual' : 'default',
    confirmedOrdersSource:
      manual?.confirmedOrders != null ? 'manual' : automatic ? 'automatic' : 'missing',
    postedOrders,
    costCompleteOrders,
    projectedCoveragePct: postedOrders > 0 ? (costCompleteOrders / postedOrders) * 100 : null,
    stateAdjustedProfitDzd,
    returnExposedOrders: automatic?.returnExposedOrders ?? postedOrders,
  };
}

export function stateAwareProjectedContribution({
  realizedGrossProfitDzd,
  returnExposedGrossProfitDzd,
  planningReturnRatePct,
}: {
  realizedGrossProfitDzd: number;
  returnExposedGrossProfitDzd: number;
  planningReturnRatePct: number;
}) {
  if (planningReturnRatePct === 100) return 0;
  return realizedGrossProfitDzd + returnExposedGrossProfitDzd * (1 - planningReturnRatePct / 100);
}

async function loadOrderCohortDayEconomics(
  db: Database,
  startDate: string | null,
  endDate: string,
  status: number,
) {
  const result = await db.execute(sql`
    with first_status as (
      select distinct on (${orderStatusHistory.orderId})
        ${orderStatusHistory.orderId} as order_id,
        (${orderStatusHistory.changedAt} at time zone ${ANALYTICS_TIMEZONE})::date as day
      from ${orderStatusHistory}
      where ${orderStatusHistory.status} = ${status}
      order by ${orderStatusHistory.orderId}, ${orderStatusHistory.changedAt} asc
    ), lifecycle as (
      select ${ecotrackOrderTrackingEvents.orderId} as order_id,
        min(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) filter (where ${ecotrackOrderTrackingEvents.status} = 'livred') as delivered_at,
        max(
          ${ecotrackOrderTrackingEvents.eventDate}::timestamp
          + nullif(${ecotrackOrderTrackingEvents.eventTime}, '')::time
        ) as latest_activity_at
      from ${ecotrackOrderTrackingEvents}
      group by ${ecotrackOrderTrackingEvents.orderId}
    ), line_economics as (
      select ${orderLineItems.orderId} as order_id,
        bool_and(
          ${orderLineItems.unitPurchasePriceSnapshot} is not null
          and ${orderLineItems.lineTotal} is not null
        ) as cost_complete,
        sum(
          ${orderLineItems.lineTotal}
          - coalesce(
            ${orderLineItems.unitPurchasePriceSnapshot} * ${orderLineItems.quantity},
            ${orderLineItems.lineTotal} * ${1 - ANALYTICS_FALLBACK_PRODUCT_MARGIN_RATE}
          )
        )::double precision as gross_profit
      from ${orderLineItems}
      group by ${orderLineItems.orderId}
    ), classified as (
      select first_status.day,
        line_economics.cost_complete,
        line_economics.gross_profit,
        case
          when ${effectiveEcotrackStatusSql({
            localStatus: orders.inHouseStatus,
            providerStatus: ecotrackOrderStates.currentStatus,
            latestActivityAt: sql`lifecycle.latest_activity_at`,
            fallbackActivityAt: sql`coalesce(
              ${ecotrackOrderStates.providerCreatedAt} at time zone ${ANALYTICS_TIMEZONE},
              first_status.day::timestamp
            )`,
            referenceAt: sql`${endDate}::date + interval '1 day'`,
          })} in ('retour_archive', 'annule', 'failed') then 'lost'
          when ${effectiveEcotrackStatusSql({
            localStatus: orders.inHouseStatus,
            providerStatus: ecotrackOrderStates.currentStatus,
            latestActivityAt: sql`lifecycle.latest_activity_at`,
            fallbackActivityAt: sql`coalesce(
              ${ecotrackOrderStates.providerCreatedAt} at time zone ${ANALYTICS_TIMEZONE},
              first_status.day::timestamp
            )`,
            referenceAt: sql`${endDate}::date + interval '1 day'`,
          })} in ('paye_et_archive', 'payed', 'manual_completed')
            or lifecycle.delivered_at is not null then 'realized'
          else 'exposed'
        end as contribution_state
      from first_status
      inner join ${orders} on ${orders.id} = first_status.order_id
      left join ${ecotrackOrderStates}
        on ${ecotrackOrderStates.orderId} = first_status.order_id
        and ${ecotrackOrderStates.deletedAt} is null
      left join lifecycle on lifecycle.order_id = first_status.order_id
      left join line_economics on line_economics.order_id = first_status.order_id
      where ${startDate ? sql`first_status.day >= ${startDate}::date` : sql`true`}
        and first_status.day <= ${endDate}::date
    )
    select classified.day::text as date,
      count(*)::int as cohort_orders,
      count(*) filter (where classified.cost_complete)::int as cost_complete_orders,
      count(*) filter (where contribution_state = 'exposed')::int as return_exposed_orders,
      case when count(*) filter (where classified.gross_profit is not null) = 0 then null
        else coalesce(sum(classified.gross_profit)
          filter (where classified.gross_profit is not null), 0)::double precision
        end as gross_profit_dzd,
      coalesce(sum(classified.gross_profit)
        filter (where contribution_state = 'realized'), 0)::double precision
        as realized_gross_profit_dzd,
      coalesce(sum(classified.gross_profit)
        filter (where contribution_state = 'exposed'), 0)::double precision
        as return_exposed_gross_profit_dzd
    from classified
    group by classified.day
    order by classified.day
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row): OrderCohortDayEconomics => ({
    date: String(row.date),
    orderCount: numeric(row.cohort_orders),
    costCompleteOrders: numeric(row.cost_complete_orders),
    grossProfitDzd: row.gross_profit_dzd == null ? null : numeric(row.gross_profit_dzd),
    realizedGrossProfitDzd: numeric(row.realized_gross_profit_dzd),
    returnExposedGrossProfitDzd: numeric(row.return_exposed_gross_profit_dzd),
    returnExposedOrders: numeric(row.return_exposed_orders),
  }));
}

async function loadAutomaticDayEconomics(db: Database, startDate: string | null, endDate: string) {
  const rows = await loadOrderCohortDayEconomics(db, startDate, endDate, ORDER_STATUS.POSTED);
  return rows.map((row): AutomaticDayEconomics => ({
    date: row.date,
    postedOrders: row.orderCount,
    costCompleteOrders: row.costCompleteOrders,
    grossProfitDzd: row.grossProfitDzd,
    realizedGrossProfitDzd: row.realizedGrossProfitDzd,
    returnExposedGrossProfitDzd: row.returnExposedGrossProfitDzd,
    returnExposedOrders: row.returnExposedOrders,
  }));
}

async function loadMetaDayEconomics(db: Database, startDate: string | null, endDate: string) {
  const conditions = [lte(metaAdsDailyInsights.day, endDate)];
  if (startDate) conditions.push(gte(metaAdsDailyInsights.day, startDate));
  const rows = await db
    .select({
      date: metaAdsDailyInsights.day,
      accountCurrency: sql<
        string | null
      >`case when count(distinct ${metaAdsDailyInsights.accountCurrency}) = 1 then max(${metaAdsDailyInsights.accountCurrency}) else null end`,
      spendEur: sql<number>`coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision`,
      impressions: sql<number>`coalesce(sum(${metaAdsDailyInsights.impressions}), 0)::double precision`,
      linkClicks: sql<number>`coalesce(sum(${metaAdsDailyInsights.inlineLinkClicks}), 0)::int`,
      landingPageViews: sql<number>`coalesce(sum(${metaAdsDailyInsights.landingPageViews}), 0)::double precision`,
      purchases: sql<number>`coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision`,
      metaSyncedAt: sql<Date | null>`max(${metaAdsDailyInsights.syncedAt})`,
    })
    .from(metaAdsDailyInsights)
    .where(and(...conditions))
    .groupBy(metaAdsDailyInsights.day)
    .orderBy(asc(metaAdsDailyInsights.day));

  return rows.map((row): MetaDayEconomics => {
    const spendEur = numeric(row.spendEur);
    const impressions = numeric(row.impressions);
    const linkClicks = numeric(row.linkClicks);
    return {
      date: row.date,
      accountCurrency: row.accountCurrency,
      spendEur,
      impressions,
      fbPurchases: numeric(row.purchases),
      cpm: impressions > 0 ? (spendEur / impressions) * 1_000 : 0,
      ctr: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
      linkClicks,
      landingPageViews: numeric(row.landingPageViews),
      metaSyncedAt: isoTimestamp(row.metaSyncedAt),
    };
  });
}

async function loadRealizedDayEconomics(db: Database, startDate: string | null, endDate: string) {
  const result = await db.execute(sql`
    with realized as (
      select (
          coalesce(${processedOrders.encaissedAt}, ${processedOrders.deliveredAt}, ${processedOrders.orderCreatedAt})
          at time zone ${sql.raw(`'${ANALYTICS_TIMEZONE}'`)}
        )::date as day,
        ${processedOrders.amountCollected} as amount_collected,
        ${processedOrders.netRevenue} as net_revenue,
        ${processedOrders.totalFees} as total_fees,
        ${processedOrders.profit} as profit
      from ${processedOrders}
    )
    select day::text as date,
      count(*)::int as settled_orders,
      coalesce(sum(amount_collected), 0)::double precision as amount_collected_dzd,
      coalesce(sum(net_revenue), 0)::double precision as net_revenue_dzd,
      coalesce(sum(total_fees), 0)::double precision as fees_dzd,
      coalesce(sum(profit), 0)::double precision as realized_profit_dzd
    from realized
    where day is not null
      and ${startDate ? sql`day >= ${startDate}::date` : sql`true`}
      and day <= ${endDate}::date
    group by day
    order by day
  `);

  return (result.rows as Array<Record<string, unknown>>).map((row): RealizedDayEconomics => ({
    date: String(row.date),
    settledOrders: numeric(row.settled_orders),
    amountCollectedDzd: numeric(row.amount_collected_dzd),
    netRevenueDzd: numeric(row.net_revenue_dzd),
    feesDzd: numeric(row.fees_dzd),
    realizedProfitDzd: numeric(row.realized_profit_dzd),
  }));
}

function mapSettings(row: typeof profitTrackerSettings.$inferSelect | undefined) {
  if (!row) return DEFAULT_SETTINGS;
  return {
    fxRate: numeric(row.fxRate),
    defaultReturnRate: numeric(row.defaultReturnRate),
    restFrom: row.restFrom,
  } satisfies ProfitTrackerSettings;
}

function mapDay(row: typeof profitTrackerDays.$inferSelect): ProfitTrackerDayInput {
  return {
    date: row.day,
    spendEur: nullableNumeric(row.spendEur),
    fbPurchases: nullableNumeric(row.fbPurchases),
    cpm: nullableNumeric(row.cpm),
    ctr: nullableNumeric(row.ctr),
    linkClicks: row.linkClicks,
    landingPageViews: nullableNumeric(row.landingPageViews),
    grossProfitDzd: nullableNumeric(row.grossProfitDzd),
    returnRatePct: nullableNumeric(row.returnRatePct),
    confirmedOrders: row.confirmedOrders,
    note: row.note,
    fxRateUsed: numeric(row.fxRateUsed),
    metaSyncedAt: row.metaSyncedAt?.toISOString() ?? null,
  };
}

function mapCost(
  row: typeof profitTrackerOperatingCosts.$inferSelect,
): ProfitTrackerOperatingCost & { id: number } {
  return {
    id: row.id,
    name: row.name,
    amountDzd: numeric(row.amountDzd),
    period: row.period === 'once' ? 'once' : 'monthly',
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

export async function getProfitTrackerSettings(db: Database = getDb()) {
  const row = await db.query.profitTrackerSettings.findFirst({
    where: eq(profitTrackerSettings.id, 1),
  });
  return mapSettings(row);
}

export async function updateProfitTrackerSettings(
  input: Partial<z.infer<typeof profitTrackerSettingsSchema>>,
  db: Database = getDb(),
) {
  const patch = profitTrackerSettingsSchema.partial().strict().parse(input);
  return db.transaction(async (tx) => {
    await tx
      .insert(profitTrackerSettings)
      .values({
        id: 1,
        fxRate: String(DEFAULT_SETTINGS.fxRate),
        defaultReturnRate: String(DEFAULT_SETTINGS.defaultReturnRate),
        restFrom: null,
      })
      .onConflictDoNothing({ target: profitTrackerSettings.id });
    const [stored] = await tx
      .select()
      .from(profitTrackerSettings)
      .where(eq(profitTrackerSettings.id, 1))
      .for('update');
    const previous = mapSettings(stored);
    const value = profitTrackerSettingsSchema.parse({ ...previous, ...patch });
    const [row] = await tx
      .update(profitTrackerSettings)
      .set({
        fxRate: String(value.fxRate),
        defaultReturnRate: String(value.defaultReturnRate),
        restFrom: value.restFrom,
        updatedAt: new Date(),
      })
      .where(eq(profitTrackerSettings.id, 1))
      .returning();
    return { previous, current: mapSettings(row) };
  });
}

export async function upsertProfitTrackerDay(
  input: ProfitTrackerDayUpdate,
  db: Database = getDb(),
) {
  const value = profitTrackerDaySchema.parse(input);
  const settings = await getProfitTrackerSettings(db);
  const now = new Date();
  const provided = new Set(Object.keys(input));
  const insertValue: typeof profitTrackerDays.$inferInsert = {
    day: value.date,
    spendEur: value.spendEur == null ? null : String(value.spendEur),
    fbPurchases: value.fbPurchases == null ? null : String(value.fbPurchases),
    cpm: value.cpm == null ? null : String(value.cpm),
    ctr: value.ctr == null ? null : String(value.ctr),
    linkClicks: value.linkClicks ?? null,
    landingPageViews: value.landingPageViews == null ? null : String(value.landingPageViews),
    grossProfitDzd: value.grossProfitDzd == null ? null : String(value.grossProfitDzd),
    returnRatePct: value.returnRatePct == null ? null : String(value.returnRatePct),
    confirmedOrders: value.confirmedOrders ?? null,
    note: value.note || null,
    fxRateUsed: String(settings.fxRate),
    createdAt: now,
    updatedAt: now,
  };
  const updateValue = {
    updatedAt: now,
    ...(provided.has('spendEur') ? { spendEur: insertValue.spendEur } : {}),
    ...(provided.has('fbPurchases') ? { fbPurchases: insertValue.fbPurchases } : {}),
    ...(provided.has('cpm') ? { cpm: insertValue.cpm } : {}),
    ...(provided.has('ctr') ? { ctr: insertValue.ctr } : {}),
    ...(provided.has('linkClicks') ? { linkClicks: insertValue.linkClicks } : {}),
    ...(provided.has('landingPageViews') ? { landingPageViews: insertValue.landingPageViews } : {}),
    ...(provided.has('grossProfitDzd') ? { grossProfitDzd: insertValue.grossProfitDzd } : {}),
    ...(provided.has('returnRatePct') ? { returnRatePct: insertValue.returnRatePct } : {}),
    ...(provided.has('confirmedOrders') ? { confirmedOrders: insertValue.confirmedOrders } : {}),
    ...(provided.has('note') ? { note: insertValue.note } : {}),
  } satisfies Partial<typeof profitTrackerDays.$inferInsert>;
  const [row] = await db
    .insert(profitTrackerDays)
    .values(insertValue)
    .onConflictDoUpdate({ target: profitTrackerDays.day, set: updateValue })
    .returning();
  return mapDay(row);
}

export async function deleteProfitTrackerDay(
  date: string,
  db: Database = getDb(),
): Promise<string | null> {
  const parsedDate = dateOnlySchema.parse(date);
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(profitTrackerDays)
      .where(eq(profitTrackerDays.day, parsedDate))
      .returning({ day: profitTrackerDays.day });
    if (rows.length) await invalidateDeletedEconomics(tx);
    return rows[0]?.day ?? null;
  });
}

// Deleted rows cannot contribute their updatedAt to the materialized-fact
// freshness check. Advance the existing global economics dependency atomically.
async function invalidateDeletedEconomics(db: Pick<Database, 'insert'>) {
  const now = new Date();
  await db
    .insert(profitTrackerSettings)
    .values({
      id: 1,
      fxRate: String(DEFAULT_SETTINGS.fxRate),
      defaultReturnRate: String(DEFAULT_SETTINGS.defaultReturnRate),
      restFrom: DEFAULT_SETTINGS.restFrom,
      updatedAt: now,
    })
    .onConflictDoUpdate({ target: profitTrackerSettings.id, set: { updatedAt: now } });
}

export async function listProfitTrackerCosts(db: Database = getDb()) {
  const rows = await db
    .select()
    .from(profitTrackerOperatingCosts)
    .orderBy(asc(profitTrackerOperatingCosts.period), asc(profitTrackerOperatingCosts.name));
  return rows.map(mapCost);
}

export async function createProfitTrackerCost(
  input: z.input<typeof profitTrackerCostSchema>,
  db: Database = getDb(),
  requestId?: string,
) {
  const value = profitTrackerCostSchema.parse(input);
  const create = async (writer: Pick<Database, 'insert'>) => {
    const [row] = await writer
      .insert(profitTrackerOperatingCosts)
      .values({
        name: value.name,
        amountDzd: String(value.amountDzd),
        period: value.period,
        startDate: value.startDate,
        endDate: value.endDate,
      })
      .returning();
    return mapCost(row);
  };
  if (!requestId) return create(db);
  return (
    await runIdempotentAdminMutation(db, {
      scope: 'profit-tracker-cost:create',
      requestId,
      payload: value,
      execute: create,
    })
  ).value;
}

export async function updateProfitTrackerCost(
  id: number,
  input: z.input<typeof profitTrackerCostPatchSchema>,
  db: Database = getDb(),
) {
  const patch = profitTrackerCostPatchSchema.parse(input);
  return db.transaction(async (tx) => {
    const [stored] = await tx
      .select()
      .from(profitTrackerOperatingCosts)
      .where(eq(profitTrackerOperatingCosts.id, id))
      .for('update');
    if (!stored) return null;
    const previous = mapCost(stored);
    const value = profitTrackerCostSchema.parse({ ...previous, ...patch });
    const [row] = await tx
      .update(profitTrackerOperatingCosts)
      .set({
        name: value.name,
        amountDzd: String(value.amountDzd),
        period: value.period,
        startDate: value.startDate,
        endDate: value.endDate,
        updatedAt: new Date(),
      })
      .where(eq(profitTrackerOperatingCosts.id, id))
      .returning();
    return { previous, current: mapCost(row) };
  });
}

export async function deleteProfitTrackerCost(id: number, db: Database = getDb()) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(profitTrackerOperatingCosts)
      .where(eq(profitTrackerOperatingCosts.id, id))
      .returning();
    if (row) await invalidateDeletedEconomics(tx);
    return row ? mapCost(row) : null;
  });
}

export async function syncProfitTrackerMetaRows(
  rows: readonly ProfitTrackerMetaRow[],
  db: Database = getDb(),
  range?: ProfitTrackerMetaSyncRange,
) {
  if (rows.length === 0 && !range) return [];
  const unsupportedCurrency =
    rows.find((row) => row.accountCurrency.toUpperCase() !== 'EUR')?.accountCurrency ??
    (range?.accountCurrency.toUpperCase() !== 'EUR' ? range?.accountCurrency : null);
  if (unsupportedCurrency) {
    throw new Error(
      `Profit tracker requires an EUR Meta account; received ${unsupportedCurrency}.`,
    );
  }

  const settings = await getProfitTrackerSettings(db);
  const byDay = new Map<
    string,
    {
      spend: number;
      impressions: number;
      inlineLinkClicks: number;
      landingPageViews: number;
      purchases: number;
      rowCount: number;
      syncedAt: Date;
    }
  >();
  for (const row of rows) {
    const current = byDay.get(row.day) ?? {
      spend: 0,
      impressions: 0,
      inlineLinkClicks: 0,
      landingPageViews: 0,
      purchases: 0,
      rowCount: 0,
      syncedAt: row.syncedAt,
    };
    current.spend += numeric(row.spend);
    current.impressions += row.impressions;
    current.inlineLinkClicks += row.inlineLinkClicks;
    current.landingPageViews += numeric(row.landingPageViews);
    current.purchases += numeric(row.purchases);
    current.rowCount += 1;
    if (row.syncedAt > current.syncedAt) current.syncedAt = row.syncedAt;
    byDay.set(row.day, current);
  }

  if (range) {
    for (let day = range.since; day <= range.until; day = addDays(day, 1)) {
      if (!byDay.has(day)) {
        byDay.set(day, {
          spend: 0,
          impressions: 0,
          inlineLinkClicks: 0,
          landingPageViews: 0,
          purchases: 0,
          rowCount: 0,
          syncedAt: range.syncedAt,
        });
      }
    }
  }

  const values = [...byDay.entries()].map(([day, aggregate]) => ({
    day,
    spendEur: String(aggregate.spend),
    fbPurchases: String(aggregate.purchases),
    cpm:
      aggregate.impressions > 0 ? String((aggregate.spend / aggregate.impressions) * 1_000) : '0',
    ctr:
      aggregate.impressions > 0
        ? String((aggregate.inlineLinkClicks / aggregate.impressions) * 100)
        : '0',
    linkClicks: aggregate.inlineLinkClicks,
    landingPageViews: String(aggregate.landingPageViews),
    rawMetaJson: {
      source: 'meta_ads_daily_insights',
      currency: 'EUR',
      rows: aggregate.rowCount,
    },
    fxRateUsed: String(settings.fxRate),
    metaSyncedAt: aggregate.syncedAt,
    updatedAt: aggregate.syncedAt,
  })) satisfies Array<typeof profitTrackerDays.$inferInsert>;

  await db
    .insert(profitTrackerDays)
    .values(values)
    .onConflictDoUpdate({
      target: profitTrackerDays.day,
      set: {
        spendEur: sql`excluded.spend_eur`,
        fbPurchases: sql`excluded.fb_purchases`,
        cpm: sql`excluded.cpm`,
        ctr: sql`excluded.ctr`,
        linkClicks: sql`excluded.link_clicks`,
        landingPageViews: sql`excluded.landing_page_views`,
        rawMetaJson: sql`excluded.raw_meta_json`,
        metaSyncedAt: sql`excluded.meta_synced_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  return [...byDay.keys()].sort();
}

async function listAdsetPerformance(
  startDate: string | null,
  endDate: string,
  dayByDate: Map<string, ReturnType<typeof applyProfitTrackerRollforward>[number]>,
  fallbackFxRate: number,
  db: Database,
) {
  const conditions = [lte(metaAdsDailyInsights.day, endDate)];
  if (startDate) conditions.push(gte(metaAdsDailyInsights.day, startDate));
  const rows = await db
    .select({
      day: metaAdsDailyInsights.day,
      adsetId: metaAdsDailyInsights.adsetId,
      adsetName: sql<string | null>`max(${metaAdsDailyInsights.adsetName})`,
      spend: sql<number>`coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision`,
      purchases: sql<number>`coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision`,
      purchaseValue: sql<number>`coalesce(sum(${metaAdsDailyInsights.purchaseValue}), 0)::double precision`,
    })
    .from(metaAdsDailyInsights)
    .where(and(...conditions))
    .groupBy(metaAdsDailyInsights.day, metaAdsDailyInsights.adsetId)
    .orderBy(desc(metaAdsDailyInsights.day));

  const totalsByDay = new Map<string, { purchaseValue: number; purchases: number }>();
  for (const row of rows) {
    const current = totalsByDay.get(row.day) ?? { purchaseValue: 0, purchases: 0 };
    current.purchaseValue += numeric(row.purchaseValue);
    current.purchases += numeric(row.purchases);
    totalsByDay.set(row.day, current);
  }
  const byAdset = new Map<
    string,
    {
      adsetId: string;
      adsetName: string;
      days: number;
      spendEur: number;
      purchases: number;
      purchaseValue: number;
      adCostDzd: number;
      estimatedNetProfitDzd: number;
      hasEstimate: boolean;
    }
  >();
  for (const row of rows) {
    const current = byAdset.get(row.adsetId) ?? {
      adsetId: row.adsetId,
      adsetName: row.adsetName || row.adsetId,
      days: 0,
      spendEur: 0,
      purchases: 0,
      purchaseValue: 0,
      adCostDzd: 0,
      estimatedNetProfitDzd: 0,
      hasEstimate: false,
    };
    const spend = numeric(row.spend);
    const purchases = numeric(row.purchases);
    const purchaseValue = numeric(row.purchaseValue);
    const trackedDay = dayByDate.get(row.day);
    const fxRate = trackedDay?.fxRateUsed || fallbackFxRate;
    const adCostDzd = spend * fxRate;
    const dayTotals = totalsByDay.get(row.day)!;
    const share =
      dayTotals.purchaseValue > 0
        ? purchaseValue / dayTotals.purchaseValue
        : dayTotals.purchases > 0
          ? purchases / dayTotals.purchases
          : 0;
    current.days += 1;
    current.spendEur += spend;
    current.purchases += purchases;
    current.purchaseValue += purchaseValue;
    current.adCostDzd += adCostDzd;
    if (trackedDay?.metrics.adjustedProfitDzd != null) {
      current.estimatedNetProfitDzd += trackedDay.metrics.adjustedProfitDzd * share - adCostDzd;
      current.hasEstimate = true;
    }
    byAdset.set(row.adsetId, current);
  }

  return {
    summary: [...byAdset.values()]
      .map((row) => ({
        ...row,
        costPerPurchaseDzd: row.purchases > 0 ? row.adCostDzd / row.purchases : null,
      }))
      .sort((left, right) => right.spendEur - left.spendEur),
    daily: rows.map((row) => ({
      date: row.day,
      adsetId: row.adsetId,
      adsetName: row.adsetName || row.adsetId,
      spendEur: numeric(row.spend),
    })),
  };
}

function indexMetaDays(
  metaDays: MetaDayEconomics[],
  dayRows: Array<typeof profitTrackerDays.$inferSelect>,
) {
  const metaByDate = new Map(metaDays.map((day) => [day.date, day]));
  // A successful range sync records days that Meta omitted because activity was zero.
  // Historical manual inputs and days outside those synced ranges remain unknown.
  for (const row of dayRows) {
    const evidence = row.rawMetaJson as {
      source?: string;
      rows?: number;
      currency?: string;
    } | null;
    if (
      !metaByDate.has(row.day) &&
      row.metaSyncedAt &&
      evidence?.source === 'meta_ads_daily_insights' &&
      evidence.rows === 0 &&
      evidence.currency === 'EUR'
    ) {
      metaByDate.set(row.day, {
        date: row.day,
        accountCurrency: 'EUR',
        spendEur: 0,
        impressions: 0,
        fbPurchases: 0,
        cpm: 0,
        ctr: 0,
        linkClicks: 0,
        landingPageViews: 0,
        metaSyncedAt: isoTimestamp(row.metaSyncedAt),
      });
    }
  }

  return metaByDate;
}

export async function getProfitTrackerReport(
  input: ProfitTrackerRangeInput,
  options: { db?: Database; now?: Date } = {},
) {
  const db = options.db ?? getDb();
  const { range, startDate, endDate } = resolveAnalyticsFilters(
    { ...profitTrackerRangeSchema.parse(input), view: 'money', grain: 'auto' },
    options.now,
  );
  return loadProfitTrackerReportForRange(db, { range, startDate, endDate });
}

// Canonical reporting clips already-validated source windows. A source with no
// overlapping coverage intentionally supplies an empty start > end interval.
export async function loadProfitTrackerReportForRange(
  db: Database,
  filters: Pick<AnalyticsFilters, 'range' | 'startDate' | 'endDate'>,
) {
  const settings = await getProfitTrackerSettings(db);
  const queryStartDate = filters.startDate
    ? filters.startDate > filters.endDate
      ? filters.startDate
      : addDays(filters.startDate, -7)
    : null;
  const dayConditions = [lte(profitTrackerDays.day, filters.endDate)];
  if (queryStartDate) dayConditions.push(gte(profitTrackerDays.day, queryStartDate));
  const [dayRows, costs, automaticDays, metaDays, realizedDays] = await Promise.all([
    db
      .select()
      .from(profitTrackerDays)
      .where(and(...dayConditions))
      .orderBy(asc(profitTrackerDays.day)),
    listProfitTrackerCosts(db),
    loadAutomaticDayEconomics(db, queryStartDate, filters.endDate),
    loadMetaDayEconomics(db, queryStartDate, filters.endDate),
    loadRealizedDayEconomics(db, queryStartDate, filters.endDate),
  ]);

  const unsupportedCurrency = metaDays.find(
    (day) => day.accountCurrency?.toUpperCase() !== 'EUR',
  )?.accountCurrency;
  if (unsupportedCurrency !== undefined) {
    throw new Error(
      `Profit tracker requires an EUR Meta account; received ${unsupportedCurrency || 'mixed currencies'}.`,
    );
  }

  const manualByDate = new Map(dayRows.map((row) => [row.day, mapDay(row)]));
  const automaticByDate = new Map(automaticDays.map((day) => [day.date, day]));
  const metaByDate = indexMetaDays(metaDays, dayRows);
  const realizedByDate = new Map(realizedDays.map((day) => [day.date, day]));
  const dates = new Set<string>([
    ...manualByDate.keys(),
    ...automaticByDate.keys(),
    ...metaByDate.keys(),
    ...realizedByDate.keys(),
  ]);
  const canonicalDays = [...dates].sort().map((date): ProfitTrackerDayInput =>
    resolveProfitTrackerDaySources({
      date,
      manual: manualByDate.get(date),
      automatic: automaticByDate.get(date),
      meta: metaByDate.get(date),
      settings,
    }),
  );
  const rolled = applyProfitTrackerRollforward(canonicalDays, settings);
  const selected = rolled.filter(
    (day) => (!filters.startDate || day.date >= filters.startDate) && day.date <= filters.endDate,
  );
  const effectiveStartDate = filters.startDate ?? selected.at(-1)?.date ?? null;
  const effectiveEndDate = selected[0]?.date ?? filters.endDate;
  const profitsSuppressed = settings.defaultReturnRate === 100;
  const summary = summarizeProfitTracker(
    selected,
    costs,
    effectiveStartDate,
    effectiveStartDate ? effectiveEndDate : null,
    profitsSuppressed,
  );
  let cumulativeNetDzd = 0;
  let cumulativeNetBeforeReturnsDzd = 0;
  let cumulativeTrueProfitDzd = 0;
  const enrichedAscending = [...selected].reverse().map((day) => {
    const operatingCostDzd = operatingCostForDay(day.date, costs);
    const trueProfitDzd = profitsSuppressed
      ? 0
      : day.metrics.netProfitDzd == null
        ? null
        : day.metrics.netProfitDzd - operatingCostDzd;
    cumulativeNetDzd += day.metrics.netProfitDzd || 0;
    cumulativeNetBeforeReturnsDzd += day.metrics.netProfitBeforeReturnsDzd || 0;
    cumulativeTrueProfitDzd += trueProfitDzd || 0;
    return {
      ...day,
      operatingCostDzd,
      trueProfitDzd,
      cumulativeNetDzd,
      cumulativeNetBeforeReturnsDzd,
      cumulativeTrueProfitDzd,
    };
  });
  const days = enrichedAscending.reverse();
  const dayByDate = new Map(selected.map((day) => [day.date, day]));
  const adsetPerformance = await listAdsetPerformance(
    filters.startDate,
    filters.endDate,
    dayByDate,
    settings.fxRate,
    db,
  );
  const realizedSelected = [...realizedByDate.values()]
    .filter(
      (day) => (!filters.startDate || day.date >= filters.startDate) && day.date <= filters.endDate,
    )
    .sort((left, right) => right.date.localeCompare(left.date))
    .map((day) => {
      const knownMetaAdCostDzd = dayByDate.get(day.date)?.metrics.adCostDzd ?? null;
      return {
        ...day,
        realizedProfitDzd: profitsSuppressed ? 0 : day.realizedProfitDzd,
        knownMetaAdCostDzd,
        realizedProfitAfterAdsDzd: profitsSuppressed
          ? 0
          : knownMetaAdCostDzd == null
            ? null
            : day.realizedProfitDzd - knownMetaAdCostDzd,
      };
    });
  const realizedSummary = realizedSelected.reduce(
    (total, day) => {
      total.settledOrders += day.settledOrders;
      total.amountCollectedDzd += day.amountCollectedDzd;
      total.netRevenueDzd += day.netRevenueDzd;
      total.feesDzd += day.feesDzd;
      total.realizedProfitDzd += day.realizedProfitDzd;
      if (day.knownMetaAdCostDzd != null) {
        total.knownMetaAdCostDzd += day.knownMetaAdCostDzd;
        total.realizedProfitAfterAdsDzd += day.realizedProfitAfterAdsDzd || 0;
        total.metaCoveredDays += 1;
      }
      return total;
    },
    {
      settledOrders: 0,
      amountCollectedDzd: 0,
      netRevenueDzd: 0,
      feesDzd: 0,
      realizedProfitDzd: 0,
      knownMetaAdCostDzd: 0,
      realizedProfitAfterAdsDzd: 0,
      metaCoveredDays: 0,
    },
  );
  const periodMetaDays = selected.filter((day) => day.metrics.adCostDzd != null);
  const periodKnownMetaAdCostDzd = summary.ratioAdCostDzd;
  realizedSummary.knownMetaAdCostDzd = periodKnownMetaAdCostDzd;
  realizedSummary.realizedProfitAfterAdsDzd = profitsSuppressed
    ? 0
    : realizedSummary.realizedProfitDzd - periodKnownMetaAdCostDzd;
  realizedSummary.metaCoveredDays = periodMetaDays.length;
  const reportThroughDate = realizedSelected.at(0)?.date ?? null;
  const settlementCoveragePct =
    summary.postedOrders > 0 ? (realizedSummary.settledOrders / summary.postedOrders) * 100 : null;
  const pendingRollforwardDzd = selected[0]?.isRestDay ? selected[0].rolledOutDzd : 0;

  return {
    filters: {
      ...filters,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
    },
    settings,
    summary,
    days,
    weeks: buildProfitTrackerWeeks(selected, costs, filters.endDate, profitsSuppressed),
    costs,
    adsets: adsetPerformance.summary,
    adsetDailySpend: adsetPerformance.daily,
    realized: {
      summary: {
        ...realizedSummary,
        postedOrders: summary.postedOrders,
        settlementCoveragePct,
      },
      days: realizedSelected,
      reportThroughDate,
    },
    coverage: {
      projectedOrders: summary.postedOrders,
      costCompleteOrders: summary.costCompleteOrders,
      projectedCoveragePct: summary.projectedCoveragePct,
      settledOrders: realizedSummary.settledOrders,
      settlementCoveragePct,
      metaDays: metaDays.filter(
        (day) =>
          (!filters.startDate || day.date >= filters.startDate) && day.date <= filters.endDate,
      ).length,
      pendingRollforwardDzd,
    },
    warnings: [
      ...(summary.projectedCoveragePct != null && summary.projectedCoveragePct < 95
        ? [
            'Some posted orders use the 30% fallback product margin because purchase-cost snapshots are incomplete.',
          ]
        : []),
      ...(pendingRollforwardDzd > 0
        ? ['The trailing Friday Meta spend is pending roll-forward to the next working day.']
        : []),
    ],
    freshness: {
      metaSyncedAt:
        days
          .map((day) => day.metaSyncedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
      settledReportThroughDate: reportThroughDate,
    },
  };
}

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
    const report = await getProfitTrackerReport(
      {
        range: 'custom',
        startDate: input.startDate,
        endDate: input.endDate,
      },
      { db, ...(options.now ? { now: options.now } : {}) },
    );
    const byDate = new Map(report.days.map((day) => [day.date, day]));
    return dates.map((reportDay) =>
      toCanonicalOrderProjectionDay({
        basis: input.basis,
        reportDay,
        day: byDate.get(reportDay),
        defaultReturnRate: report.settings.defaultReturnRate,
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

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function exportProfitTrackerCsv(
  input: ProfitTrackerRangeInput,
  options: { db?: Database; now?: Date } = {},
) {
  const report = await getProfitTrackerReport(input, options);
  const header = [
    'date',
    'spend_eur',
    'impressions',
    'fb_purchases',
    'cpm',
    'ctr',
    'link_clicks',
    'landing_page_views',
    'gross_profit_dzd',
    'gross_profit_source',
    'return_rate_pct',
    'return_rate_source',
    'posted_or_manual_orders',
    'posted_or_manual_orders_source',
    'posted_orders',
    'cost_complete_orders',
    'projected_coverage_pct',
    'fx_rate_used',
    'ad_cost_dzd',
    'adjusted_profit_dzd',
    'net_profit_dzd',
    'profit_x',
    'net_profit_before_returns_dzd',
    'profit_x_before_returns',
    'cost_per_posted_or_manual_order_dzd',
    'posted_or_manual_orders_to_meta_purchases_pct',
    'click_to_page_rate_pct',
    'operating_cost_dzd',
    'true_profit_dzd',
    'is_rest_day',
    'rolled_in_dzd',
    'rolled_out_dzd',
    'note',
  ];
  const lines = [...report.days]
    .reverse()
    .map((day) =>
      [
        day.date,
        day.spendEur,
        day.impressions,
        day.fbPurchases,
        day.cpm,
        day.ctr,
        day.linkClicks,
        day.landingPageViews,
        day.grossProfitDzd,
        day.grossProfitSource,
        day.returnRatePct,
        day.returnRateSource,
        day.confirmedOrders,
        day.confirmedOrdersSource,
        day.postedOrders,
        day.costCompleteOrders,
        day.projectedCoveragePct,
        day.fxRateUsed,
        day.metrics.adCostDzd,
        day.metrics.adjustedProfitDzd,
        day.metrics.netProfitDzd,
        day.metrics.profitX,
        day.metrics.netProfitBeforeReturnsDzd,
        day.metrics.profitXBeforeReturns,
        day.metrics.costPerConfirmedDzd,
        day.metrics.confirmationRatePct,
        day.metrics.clickToPageRatePct,
        day.operatingCostDzd,
        day.trueProfitDzd,
        day.isRestDay,
        day.rolledInDzd,
        day.rolledOutDzd,
        day.note,
      ]
        .map(csvCell)
        .join(','),
    );
  return [header.join(','), ...lines].join('\n');
}
