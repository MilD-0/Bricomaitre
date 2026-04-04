import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

import { getDb, hasDb } from '../db/client';
import { orderStatusHistory, orders } from '../db/schema';
import {
  coerceNoAnswerCount,
  coerceOrderStatus,
  orderListQuerySchema,
  type OrderRecord,
  type OrderSortKey,
  type OrderStatusHistoryRecord,
} from './orders';
import { getOrderProductLookup, toOrderRecord } from './order-records';

type OrdersQueryInput = {
  page?: string | number | undefined;
  limit?: string | number | undefined;
  search?: string | undefined;
  confirmed?: number | undefined;
  sortKey?: string | undefined;
  sortDirection?: string | undefined;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type OrdersResponse = {
  items: OrderRecord[];
  writable: boolean;
  pagination: PaginationMeta;
};

function getOrderBy(sortKey: OrderSortKey, sortDirection: 'asc' | 'desc') {
  const direction = sortDirection === 'asc' ? asc : desc;

  if (sortKey === 'fullName') {
    return [direction(orders.firstName), direction(orders.lastName), desc(orders.createdAt)] as const;
  }

  if (sortKey === 'confirmed') {
    return [direction(orders.confirmed), desc(orders.createdAt)] as const;
  }

  return [direction(orders.createdAt)] as const;
}

function buildOrderHistory(rows: typeof orderStatusHistory.$inferSelect[]): OrderStatusHistoryRecord[] {
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

export async function loadOrdersPageData(
  input: OrdersQueryInput,
  writable: boolean,
): Promise<OrdersResponse> {
  if (!hasDb()) {
    return {
      writable: false,
      items: [],
      pagination: { page: 1, limit: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
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
    ...(searchFilter ? [searchFilter] : []),
  );
  const [{ value: totalItems }] = await db.select({ value: count() }).from(orders).where(whereClause);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const rows = await db
    .select()
    .from(orders)
    .where(whereClause)
    .orderBy(...getOrderBy(query.sortKey, query.sortDirection))
    .limit(query.limit)
    .offset((page - 1) * query.limit);
  const orderIds = rows.map((row) => row.id);

  const historyCounts = orderIds.length === 0
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
