import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm';
import { dayInTimezone } from './analytics/date-range';

import { getDb, hasDb } from '@bric/db/client';
import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orders,
  orderStatusHistory,
} from '@bric/db/schema';
import type {
  DailyOrderStatusOverview,
  DailyOrderStatusReport,
  DailyProfitProjection,
  OrdersResponse,
  ProfitProjectionBasis,
} from './order-admin-contracts';
import { orderProductSearchCondition } from './order-product-search';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import {
  orderIdentifierSearchCondition,
  withOrderSearchTimeout,
  type OrderSearchDatabase,
} from './order-search';
import {
  coerceNoAnswerCount,
  coerceOrderStatus,
  ORDER_STATUS,
  orderListQuerySchema,
  type OrderRecord,
  type OrderSortRule,
  type OrderStatusHistoryRecord,
} from './orders';
import { getCanonicalOrderProjectionDays } from './profit-tracker';

type OrdersQueryInput = {
  page?: string | number | undefined;
  limit?: string | number | undefined;
  search?: string | undefined;
  inHouseStatus?: number | null | undefined;
  noAnswerCount?: number | null | undefined;
  noAnswerCountMin?: number | null | undefined;
  sort?: string[] | undefined;
  sortKey?: string | undefined;
  sortDirection?: string | undefined;
};

const DAILY_ORDER_STATUS_TIMEZONE = 'Africa/Algiers';
const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';

function getOrderBy(sortRules: OrderSortRule[]) {
  const orderBy = sortRules.flatMap((rule) => {
    const direction = rule.direction === 'asc' ? asc : desc;

    if (rule.key === 'fullName') {
      return [direction(orders.firstName), direction(orders.lastName)] as const;
    }

    if (rule.key === 'inHouseStatus') {
      return [direction(orders.inHouseStatus)] as const;
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

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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

function activeOrdersJoinPredicate() {
  return sql`true`;
}

async function loadDailyOrderStatusReport(
  db: ReturnType<typeof getDb>,
  reportDay: string,
  profitProjection?: DailyProfitProjection,
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
        and ${orderStatusHistory.status} = ${ORDER_STATUS.CONFIRMED}
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
        and ${orderStatusHistory.status} = ${ORDER_STATUS.NO_ANSWER}
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
        and ${orderStatusHistory.status} = ${ORDER_STATUS.CANCELLED}
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
    reportDays?: number;
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
  const reportDay = dayInTimezone(new Date());
  const profitProjectionBasis = options.profitProjectionBasis ?? 'confirmed';
  const reportDays = Math.min(7, Math.max(1, Math.trunc(options.reportDays ?? 2)));
  const requestedDays = Array.from({ length: reportDays }, (_, index) =>
    shiftIsoDate(reportDay, -index),
  );
  const projections = options.includeProfitProjection
    ? await getCanonicalOrderProjectionDays(
        {
          startDate: requestedDays.at(-1)!,
          endDate: reportDay,
          basis: profitProjectionBasis,
        },
        { db },
      )
    : [];
  const projectionByDay = new Map(
    projections.map((projection) => [projection.reportDay, projection]),
  );
  const reports: DailyOrderStatusReport[] = [];

  // Each daily operational report performs several independent reads. Keeping the batch
  // small avoids turning the weekly admin view into a burst of dozens of
  // concurrent database queries while still loading materially faster than a
  // fully sequential report.
  for (let index = 0; index < requestedDays.length; index += 2) {
    const batch = requestedDays.slice(index, index + 2);
    reports.push(
      ...(await Promise.all(
        batch.map((day) => loadDailyOrderStatusReport(db, day, projectionByDay.get(day))),
      )),
    );
  }
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
  const { rows, page, totalPages, totalItems } = await withOrderSearchTimeout(
    db,
    query.search,
    (connection) => loadOrderPageRows(connection, query),
  );
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

async function loadOrderPageRows(
  db: OrderSearchDatabase,
  query: ReturnType<typeof orderListQuerySchema.parse>,
) {
  const searchFilter = query.search
    ? ((await orderIdentifierSearchCondition(db, query.search)) ??
      or(
        sql`concat_ws(' ', ${orders.firstName}, ${orders.lastName}) ILIKE ${`%${query.search}%`}`,
        ilike(orders.phoneNumber1, `%${query.search}%`),
        ilike(orders.phoneNumber2, `%${query.search}%`),
        ilike(orders.note, `%${query.search}%`),
        ilike(orders.homeAddress, `%${query.search}%`),
        sql`cast(${orders.state} as text) ILIKE ${`%${query.search}%`}`,
        ilike(orders.city, `%${query.search}%`),
        orderProductSearchCondition(query.search),
      ))
    : undefined;
  const whereClause = and(
    query.inHouseStatus !== undefined
      ? sql`${orders.inHouseStatus} = ${query.inHouseStatus}`
      : undefined,
    query.inHouseStatus === ORDER_STATUS.NO_ANSWER && query.noAnswerCount != null
      ? sql`${orders.noAnswerCount} = ${query.noAnswerCount}`
      : undefined,
    query.inHouseStatus === ORDER_STATUS.NO_ANSWER && query.noAnswerCountMin != null
      ? gte(orders.noAnswerCount, query.noAnswerCountMin)
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
  return { rows, page, totalPages, totalItems };
}

export async function loadOrderDetail(
  id: number,
  db?: ReturnType<typeof getDb>,
): Promise<OrderRecord | null> {
  if (!db && !hasDb()) {
    return null;
  }

  return (await loadOrderRecordsByIds([id], db ?? getDb(), { includeHistory: true }))[0] ?? null;
}

export async function loadConfirmedOrderIds(
  filters: { businessDate?: string | null; createdAtOrAfter?: Date; createdBefore?: Date } = {},
  db = getDb(),
) {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.inHouseStatus, ORDER_STATUS.CONFIRMED),
        filters.businessDate
          ? reportDayPredicate(sql`${orders.createdAt}`, filters.businessDate)
          : undefined,
        filters.createdAtOrAfter ? gte(orders.createdAt, filters.createdAtOrAfter) : undefined,
        filters.createdBefore ? lt(orders.createdAt, filters.createdBefore) : undefined,
      ),
    )
    .orderBy(desc(orders.createdAt), desc(orders.id));
  return rows.map(({ id }) => id);
}

/** Loads canonical records in bounded batches, preserving the caller's selection order. */
export async function loadOrderRecordsByIds(
  ids: readonly number[],
  db = getDb(),
  options: { includeHistory?: boolean } = {},
): Promise<OrderRecord[]> {
  const uniqueIds = [...new Set(ids)];
  const records = new Map<number, OrderRecord>();
  for (let start = 0; start < uniqueIds.length; start += 500) {
    const rows = await db
      .select()
      .from(orders)
      .where(inArray(orders.id, uniqueIds.slice(start, start + 500)));
    const history =
      options.includeHistory && rows.length > 0
        ? await db
            .select()
            .from(orderStatusHistory)
            .where(
              inArray(
                orderStatusHistory.orderId,
                rows.map((row) => row.id),
              ),
            )
            .orderBy(asc(orderStatusHistory.changedAt))
        : [];
    const historyByOrderId = new Map<number, typeof history>();
    for (const entry of history) {
      const entries = historyByOrderId.get(entry.orderId) ?? [];
      entries.push(entry);
      historyByOrderId.set(entry.orderId, entries);
    }
    const lookup = await getOrderProductLookup(db, rows);
    for (const row of rows)
      records.set(
        row.id,
        toOrderRecord(row, buildOrderHistory(historyByOrderId.get(row.id) ?? []), lookup),
      );
  }
  return uniqueIds.flatMap((id) => {
    const record = records.get(id);
    return record ? [record] : [];
  });
}
