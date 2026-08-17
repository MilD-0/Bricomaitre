import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import {
  adCosts,
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orderStatusHistory,
  orders,
  products,
} from '@bric/db/schema';
import {
  coerceNoAnswerCount,
  coerceOrderStatus,
  orderListQuerySchema,
  type OrderRecord,
  type OrderSortRule,
  type OrderStatusHistoryRecord,
} from './orders';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import {
  buildCartProductLookup,
  collectCartProductReferenceBuckets,
  getCartProductLookupKey,
} from './order-product-references';
import type {
  DailyOrderStatusOverview,
  DailyOrderStatusReport,
  DailyProfitProjection,
  OrdersResponse,
  ProfitProjectionBasis,
} from './order-admin-contracts';

type OrdersQueryInput = {
  page?: string | number | undefined;
  limit?: string | number | undefined;
  search?: string | undefined;
  confirmed?: number | undefined;
  noAnswerCount?: number | undefined;
  sort?: string[] | undefined;
  sortKey?: string | undefined;
  sortDirection?: string | undefined;
};

type ProjectionOrderRow = {
  cartProducts: string[];
};

type ProjectionProductRow = {
  id: number;
  mongoId: string | null;
  price: unknown;
  purchasePrice: unknown;
};

const DAILY_ORDER_STATUS_TIMEZONE = 'Africa/Algiers';
const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';
const NEGATIVE_OUTCOME_STATUSES = [8, 9] as const;

const PROFIT_PROJECTION_STATUS: Record<ProfitProjectionBasis, number> = {
  confirmed: 2,
  posted: 11,
};

function getOrderBy(sortRules: OrderSortRule[]) {
  const orderBy = sortRules.flatMap((rule) => {
    const direction = rule.direction === 'asc' ? asc : desc;

    if (rule.key === 'fullName') {
      return [direction(orders.firstName), direction(orders.lastName)] as const;
    }

    if (rule.key === 'confirmed') {
      return [direction(orders.confirmed)] as const;
    }

    return [direction(orders.createdAt)] as const;
  });

  return [...orderBy, desc(orders.id)] as const;
}

function buildOrderHistory(
  rows: (typeof orderStatusHistory.$inferSelect)[],
): OrderStatusHistoryRecord[] {
  return rows.map((entry) => {
    const status = coerceOrderStatus(entry.status);

    return {
      id: entry.id,
      status,
      noAnswerCount: coerceNoAnswerCount(status, entry.noAnswerCount, entry.status),
      changedAt: entry.changedAt.toISOString(),
      changedBy: entry.changedBy,
      changedByName: entry.changedByName,
    };
  });
}

function getAlgiersReportDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_ORDER_STATUS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getPreviousMonthRange(reportDay: string) {
  const [yearPart, monthPart] = reportDay.split('-');
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 0));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readCount(db: ReturnType<typeof getDb>, query: ReturnType<typeof sql<number>>) {
  const result = await db.execute(query);
  const row = (result.rows?.[0] ?? {}) as { value?: number | string | bigint };
  const value = row?.value ?? 0;
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

function reportDayPredicate(timestampExpression: ReturnType<typeof sql>, reportDay: string) {
  return sql`${timestampExpression} >= ((${reportDay}::date)::timestamp at time zone ${DAILY_ORDER_STATUS_TIMEZONE})
    and ${timestampExpression} < ((((${reportDay}::date + 1))::timestamp) at time zone ${DAILY_ORDER_STATUS_TIMEZONE})`;
}

function reportDateRangePredicate(
  timestampExpression: ReturnType<typeof sql>,
  startDate: string,
  endDate: string,
) {
  return sql`${timestampExpression} >= ((${startDate}::date)::timestamp at time zone ${DAILY_ORDER_STATUS_TIMEZONE})
    and ${timestampExpression} < ((((${endDate}::date + 1))::timestamp) at time zone ${DAILY_ORDER_STATUS_TIMEZONE})`;
}

function activeOrdersJoinPredicate() {
  return sql`${orders.archivedAt} is null`;
}

function calculateCartGrossProfit(
  orderRows: ProjectionOrderRow[],
  productRows: ProjectionProductRow[],
) {
  const productLookup = buildCartProductLookup(productRows);

  return orderRows.reduce((sum, order) => {
    const orderProfit = (order.cartProducts ?? []).reduce((orderSum, rawProduct) => {
      const lookupKey = getCartProductLookupKey(rawProduct);
      const product = lookupKey ? productLookup.get(lookupKey) : null;

      return (
        orderSum + (product ? numberOrZero(product.price) - numberOrZero(product.purchasePrice) : 0)
      );
    }, 0);

    return sum + orderProfit;
  }, 0);
}

async function loadProfitProjection(
  db: ReturnType<typeof getDb>,
  reportDay: string,
  basis: ProfitProjectionBasis,
): Promise<DailyProfitProjection> {
  const previousMonth = getPreviousMonthRange(reportDay);
  const projectionStatus = PROFIT_PROJECTION_STATUS[basis];
  const [orderRows, adSpendRows, previousMonthRows] = await Promise.all([
    db
      .selectDistinct({
        id: orders.id,
        cartProducts: orders.cartProducts,
      })
      .from(orderStatusHistory)
      .innerJoin(orders, eq(orders.id, orderStatusHistory.orderId))
      .where(
        and(
          sql`${orders.archivedAt} is null`,
          eq(orderStatusHistory.status, projectionStatus),
          reportDayPredicate(sql`${orderStatusHistory.changedAt}`, reportDay),
        ),
      ),
    db
      .select({
        spend: sql<number>`coalesce(sum(${adCosts.spend})::double precision, 0)`,
      })
      .from(adCosts)
      .where(eq(adCosts.date, reportDay)),
    db
      .select({
        totalOrders: sql<number>`count(distinct ${orders.id})::int`,
        negativeOutcomeOrders: sql<number>`count(distinct ${orders.id}) filter (where ${inArray(orders.confirmed, [...NEGATIVE_OUTCOME_STATUSES])})::int`,
      })
      .from(orderStatusHistory)
      .innerJoin(orders, eq(orders.id, orderStatusHistory.orderId))
      .where(
        and(
          sql`${orders.archivedAt} is null`,
          eq(orderStatusHistory.status, projectionStatus),
          reportDateRangePredicate(
            sql`${orderStatusHistory.changedAt}`,
            previousMonth.start,
            previousMonth.end,
          ),
        ),
      ),
  ]);

  const cartProductReferences = collectCartProductReferenceBuckets(orderRows);
  const productRows =
    cartProductReferences.productIds.length === 0 && cartProductReferences.mongoIds.length === 0
      ? []
      : await db
          .select({
            id: products.id,
            mongoId: products.mongoId,
            price: products.price,
            purchasePrice: products.purchasePrice,
          })
          .from(products)
          .where(
            or(
              ...(cartProductReferences.productIds.length > 0
                ? [inArray(products.id, cartProductReferences.productIds)]
                : []),
              ...(cartProductReferences.mongoIds.length > 0
                ? [inArray(products.mongoId, cartProductReferences.mongoIds)]
                : []),
            ),
          );
  const grossProfit = calculateCartGrossProfit(orderRows, productRows);
  const previousMonthStats = previousMonthRows[0];
  const previousMonthOrders = previousMonthStats?.totalOrders ?? 0;
  const previousMonthNegativeOutcomeOrders = previousMonthStats?.negativeOutcomeOrders ?? 0;
  const estimatedReturnRate =
    previousMonthOrders > 0 ? previousMonthNegativeOutcomeOrders / previousMonthOrders : 0;
  const estimatedReturnedOrders = orderRows.length * estimatedReturnRate;
  const estimatedReturnLoss = Math.max(0, grossProfit) * estimatedReturnRate;
  const adSpend = numberOrZero(adSpendRows[0]?.spend);

  return {
    basis,
    reportDay,
    grossProfit: roundMoney(grossProfit),
    adSpend: roundMoney(adSpend),
    estimatedReturnRate: roundMoney(estimatedReturnRate * 100),
    estimatedReturnedOrders: roundMoney(estimatedReturnedOrders),
    estimatedReturnLoss: roundMoney(estimatedReturnLoss),
    projectedProfit: roundMoney(grossProfit - adSpend - estimatedReturnLoss),
    previousMonthStart: previousMonth.start,
    previousMonthEnd: previousMonth.end,
    previousMonthOrders,
    previousMonthNegativeOutcomeOrders,
  };
}

async function loadDailyOrderStatusReport(
  db: ReturnType<typeof getDb>,
  reportDay: string,
  includeProfitProjection: boolean,
  profitProjectionBasis: ProfitProjectionBasis,
): Promise<DailyOrderStatusReport> {
  const reportDayWhere = (timestampExpression: ReturnType<typeof sql>) =>
    reportDayPredicate(timestampExpression, reportDay);

  const [
    newOrders,
    confirmationStatusChanges,
    confirmedToday,
    noAnswerOrders,
    adminCancelled,
    carrierCancelled,
    shipmentUpdates,
    profitProjection,
  ] = await Promise.all([
    readCount(
      db,
      sql`
      select count(distinct ${orders.id})::int as value
      from ${orders}
      where ${activeOrdersJoinPredicate()}
        and ${reportDayWhere(sql`${orders.createdAt}`)}
    `,
    ),
    readCount(
      db,
      sql`
      select count(*)::int as value
      from ${orderStatusHistory}
      inner join ${orders} on ${orders.id} = ${orderStatusHistory.orderId}
      where ${activeOrdersJoinPredicate()}
        and ${reportDayWhere(sql`${orderStatusHistory.changedAt}`)}
    `,
    ),
    readCount(
      db,
      sql`
      select count(*)::int as value
      from ${orderStatusHistory}
      inner join ${orders} on ${orders.id} = ${orderStatusHistory.orderId}
      where ${activeOrdersJoinPredicate()}
        and ${orderStatusHistory.status} = 2
        and ${reportDayWhere(sql`${orderStatusHistory.changedAt}`)}
    `,
    ),
    readCount(
      db,
      sql`
      select count(distinct ${orders.id})::int as value
      from ${orderStatusHistory}
      inner join ${orders} on ${orders.id} = ${orderStatusHistory.orderId}
      where ${activeOrdersJoinPredicate()}
        and ${orderStatusHistory.status} = 1
        and ${reportDayWhere(sql`${orderStatusHistory.changedAt}`)}
    `,
    ),
    readCount(
      db,
      sql`
      select count(*)::int as value
      from ${orderStatusHistory}
      inner join ${orders} on ${orders.id} = ${orderStatusHistory.orderId}
      where ${activeOrdersJoinPredicate()}
        and ${orderStatusHistory.status} = 6
        and coalesce(${orderStatusHistory.changedByName}, '') <> ${ECOTRACK_SYNC_ACTOR_NAME}
        and ${reportDayWhere(sql`${orderStatusHistory.changedAt}`)}
    `,
    ),
    readCount(
      db,
      sql`
      with carrier_cancelled as (
        select
          ${ecotrackOrderStates.orderId} as order_id,
          coalesce(
            (
              select max(
                case
                  when activity.value->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    and coalesce(nullif(activity.value->>'time', ''), '00:00:00') ~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$'
                  then ((activity.value->>'date') || 'T' || coalesce(nullif(activity.value->>'time', ''), '00:00:00') || 'Z')::timestamptz
                  else null
                end
              )
              from jsonb_array_elements(coalesce(${ecotrackOrderStates.rawStatusPayload}->'activity', '[]'::jsonb)) as activity(value)
            ),
            ${ecotrackOrderStates.lastActionAt},
            ${ecotrackOrderStates.lastStatusSyncedAt},
            ${ecotrackOrderStates.updatedAt}
          ) as activity_at
        from ${ecotrackOrderStates}
        where lower(${ecotrackOrderStates.currentStatus}) = 'annule'
      )
      select count(distinct carrier_cancelled.order_id)::int as value
      from carrier_cancelled
      inner join ${orders} on ${orders.id} = carrier_cancelled.order_id
      where ${activeOrdersJoinPredicate()}
        and ${reportDayWhere(sql`carrier_cancelled.activity_at`)}
    `,
    ),
    readCount(
      db,
      sql`
      select count(distinct shipment_activity.order_id)::int as value
      from (
        select
          ${ecotrackOrderStates.orderId} as order_id,
          coalesce(
            (
              select max(
                case
                  when activity.value->>'date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                    and coalesce(nullif(activity.value->>'time', ''), '00:00:00') ~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$'
                  then ((activity.value->>'date') || 'T' || coalesce(nullif(activity.value->>'time', ''), '00:00:00') || 'Z')::timestamptz
                  else null
                end
              )
              from jsonb_array_elements(coalesce(${ecotrackOrderStates.rawStatusPayload}->'activity', '[]'::jsonb)) as activity(value)
            ),
            ${ecotrackOrderStates.lastActionAt},
            ${ecotrackOrderStates.lastStatusSyncedAt},
            ${ecotrackOrderStates.updatedAt}
          ) as activity_at
        from ${ecotrackOrderStates}
        inner join ${orders} on ${orders.id} = ${ecotrackOrderStates.orderId}
        where ${activeOrdersJoinPredicate()}
        union
        select ${ecotrackOrderMajEntries.orderId} as order_id, ${ecotrackOrderMajEntries.remoteCreatedAt} as activity_at
        from ${ecotrackOrderMajEntries}
        inner join ${orders} on ${orders.id} = ${ecotrackOrderMajEntries.orderId}
        where ${activeOrdersJoinPredicate()}
        union
        select
          ${ecotrackOrderTrackingEvents.orderId} as order_id,
          (${ecotrackOrderTrackingEvents.eventDate}::timestamp at time zone ${DAILY_ORDER_STATUS_TIMEZONE}) as activity_at
        from ${ecotrackOrderTrackingEvents}
        inner join ${orders} on ${orders.id} = ${ecotrackOrderTrackingEvents.orderId}
        where ${activeOrdersJoinPredicate()}
      ) shipment_activity
      where ${reportDayWhere(sql`shipment_activity.activity_at`)}
    `,
    ),
    includeProfitProjection
      ? loadProfitProjection(db, reportDay, profitProjectionBasis)
      : Promise.resolve(undefined),
  ]);

  return {
    reportDay,
    newOrders,
    confirmationStatusChanges,
    confirmedToday,
    noAnswerOrders,
    adminCancelled,
    carrierCancelled,
    shipmentUpdates,
    ...(profitProjection ? { profitProjection } : {}),
  };
}

export async function loadDailyOrderStatusOverview(
  options: {
    includeProfitProjection?: boolean;
    profitProjectionBasis?: ProfitProjectionBasis;
  } = {},
): Promise<DailyOrderStatusOverview> {
  if (!hasDb()) {
    return {
      available: false,
      reportDay: null,
      timezone: DAILY_ORDER_STATUS_TIMEZONE,
    };
  }

  const db = getDb();
  const reportDay = getAlgiersReportDay();
  const profitProjectionBasis = options.profitProjectionBasis ?? 'confirmed';
  const reports = await Promise.all([
    loadDailyOrderStatusReport(
      db,
      reportDay,
      Boolean(options.includeProfitProjection),
      profitProjectionBasis,
    ),
    loadDailyOrderStatusReport(
      db,
      shiftIsoDate(reportDay, -1),
      Boolean(options.includeProfitProjection),
      profitProjectionBasis,
    ),
  ]);
  const today = reports[0]!;

  return {
    available: true,
    reportDay,
    timezone: DAILY_ORDER_STATUS_TIMEZONE,
    reports,
    newOrders: today.newOrders,
    confirmationStatusChanges: today.confirmationStatusChanges,
    confirmedToday: today.confirmedToday,
    noAnswerOrders: today.noAnswerOrders,
    adminCancelled: today.adminCancelled,
    carrierCancelled: today.carrierCancelled,
    shipmentUpdates: today.shipmentUpdates,
  };
}

export async function loadOrdersPageData(
  input: OrdersQueryInput,
  writable: boolean,
): Promise<OrdersResponse> {
  if (!hasDb()) {
    return {
      writable: false,
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  const db = getDb();
  const query = orderListQuerySchema.parse(input);
  const searchFilter = query.search
    ? or(
        sql`concat_ws(' ', ${orders.firstName}, ${orders.lastName}) ILIKE ${`%${query.search}%`}`,
        ilike(orders.phoneNumber1, `%${query.search}%`),
        ilike(orders.phoneNumber2, `%${query.search}%`),
        ilike(orders.note, `%${query.search}%`),
        ilike(orders.homeAddress, `%${query.search}%`),
        sql`cast(${orders.state} as text) ILIKE ${`%${query.search}%`}`,
        ilike(orders.city, `%${query.search}%`),
      )
    : undefined;
  const whereClause = and(
    isNull(orders.archivedAt),
    query.confirmed !== undefined ? sql`${orders.confirmed} = ${query.confirmed}` : undefined,
    query.confirmed === 1 && query.noAnswerCount !== undefined
      ? sql`${orders.noAnswerCount} = ${query.noAnswerCount}`
      : undefined,
    ...(searchFilter ? [searchFilter] : []),
  );
  const [{ value: totalItems }] = await db
    .select({ value: count() })
    .from(orders)
    .where(whereClause);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const rows = await db
    .select()
    .from(orders)
    .where(whereClause)
    .orderBy(...getOrderBy(query.sortRules))
    .limit(query.limit)
    .offset((page - 1) * query.limit);
  const orderIds = rows.map((row) => row.id);

  const historyCounts =
    orderIds.length === 0
      ? []
      : await db
          .select({ orderId: orderStatusHistory.orderId })
          .from(orderStatusHistory)
          .where(inArray(orderStatusHistory.orderId, orderIds));
  const historyOrderIds = new Set(historyCounts.map((entry) => entry.orderId));
  const productLookup = await getOrderProductLookup(db, rows);

  return {
    writable,
    items: rows.map((row) => ({
      ...toOrderRecord(row, [], productLookup),
      hasStatusHistory: historyOrderIds.has(row.id),
      statusHistory: [],
    })),
    pagination: {
      page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function loadOrderDetail(id: number): Promise<OrderRecord | null> {
  if (!hasDb()) {
    return null;
  }

  const db = getDb();
  const row = await db.query.orders.findFirst({ where: eq(orders.id, id) });

  if (!row) {
    return null;
  }

  const historyRows = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(asc(orderStatusHistory.changedAt));
  const productLookup = await getOrderProductLookup(db, [row]);

  return toOrderRecord(row, buildOrderHistory(historyRows), productLookup);
}
