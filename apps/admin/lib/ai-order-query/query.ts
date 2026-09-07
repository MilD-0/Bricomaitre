import { getDb } from '@bric/db/client';
import { ecotrackOrderStates, orderLineItems, orders } from '@bric/db/schema';
import {
  coerceOrderStatus,
  getOrderFullName,
  parseNumericAmount,
} from '@bric/storefront-core/order-domain';
import { and, asc, count, countDistinct, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { adminAiInHouseOrderStatus } from '../admin-ai-order-status';
import { adminAiOrderQuerySchema } from './contract';
import { iso, normalizeOrderQuery, orderBy, queryConditions } from './filters';

async function queryGroupedOrderProducts(input: {
  db: ReturnType<typeof getDb>;
  where: ReturnType<typeof queryConditions>;
  activeShipmentJoin: ReturnType<typeof and>;
  query: ReturnType<typeof normalizeOrderQuery>;
  matchedOrderCount: number;
}) {
  const groupKey = sql<string>`coalesce(
    'product:' || ${orderLineItems.productId}::text,
    'captured:' || ${orderLineItems.contentId}
  )`;
  const orderCount = sql<number>`count(distinct ${orderLineItems.orderId})::int`;
  const units = sql<number>`coalesce(sum(${orderLineItems.quantity}), 0)::int`;
  const [{ value: rawTotalGroups }] = await input.db
    .select({ value: countDistinct(groupKey) })
    .from(orders)
    .innerJoin(orderLineItems, eq(orderLineItems.orderId, orders.id))
    .leftJoin(ecotrackOrderStates, input.activeShipmentJoin)
    .where(input.where);
  const totalGroups = Number(rawTotalGroups);
  const totalPages = Math.max(1, Math.ceil(totalGroups / input.query.limit));
  const page = Math.min(input.query.page, totalPages);
  const grouping = input.query.groupBy;
  if (!grouping) throw new Error('Product grouping is required.');
  const primary = grouping.sortBy === 'units' ? units : orderCount;
  const direction = grouping.direction === 'asc' ? asc : desc;
  const rows = await input.db
    .select({
      groupingKey: groupKey,
      productId: orderLineItems.productId,
      capturedReference: sql<string>`max(${orderLineItems.rawValue})`,
      capturedTitle: sql<string>`max(${orderLineItems.titleSnapshot})`,
      orderCount,
      units,
    })
    .from(orders)
    .innerJoin(orderLineItems, eq(orderLineItems.orderId, orders.id))
    .leftJoin(ecotrackOrderStates, input.activeShipmentJoin)
    .where(input.where)
    .groupBy(groupKey, orderLineItems.productId)
    .orderBy(direction(primary), asc(groupKey))
    .limit(input.query.limit)
    .offset((page - 1) * input.query.limit);

  return {
    kind: 'order_product_summary' as const,
    appliedQuery: {
      ...(input.query.search ? { search: input.query.search } : {}),
      filters: input.query.filters,
      groupBy: grouping,
      page,
      limit: input.query.limit,
    },
    matchedOrders: input.matchedOrderCount,
    items: rows.map((row) => ({
      productId: row.productId,
      capturedReference: row.capturedReference,
      capturedTitle: row.capturedTitle,
      orderCount: Number(row.orderCount),
      units: Number(row.units),
    })),
    pagination: {
      page,
      limit: input.query.limit,
      totalItems: totalGroups,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function queryAdminOrders(raw: z.input<typeof adminAiOrderQuerySchema>) {
  const input = normalizeOrderQuery(adminAiOrderQuerySchema.parse(raw));
  const db = getDb();
  const where = queryConditions(input);
  const activeShipmentJoin = and(
    eq(ecotrackOrderStates.orderId, orders.id),
    isNull(ecotrackOrderStates.deletedAt),
  );
  const [{ value: totalItems }] = await db
    .select({ value: count() })
    .from(orders)
    .leftJoin(ecotrackOrderStates, activeShipmentJoin)
    .where(where);
  const total = Number(totalItems);
  if (input.groupBy) {
    return queryGroupedOrderProducts({
      db,
      where,
      activeShipmentJoin,
      query: input,
      matchedOrderCount: total,
    });
  }
  const totalPages = Math.max(1, Math.ceil(total / input.limit));
  const page = Math.min(input.page, totalPages);
  const rows = await db
    .select({
      order: orders,
      shipmentId: ecotrackOrderStates.id,
      provider: ecotrackOrderStates.provider,
      trackingNumber: ecotrackOrderStates.trackingNumber,
      shipmentStatus: ecotrackOrderStates.currentStatus,
      lastStatusSyncedAt: ecotrackOrderStates.lastStatusSyncedAt,
    })
    .from(orders)
    .leftJoin(ecotrackOrderStates, activeShipmentJoin)
    .where(where)
    .orderBy(...orderBy(input))
    .limit(input.limit)
    .offset((page - 1) * input.limit);

  return {
    kind: 'orders' as const,
    appliedQuery: {
      ...(input.search ? { search: input.search } : {}),
      filters: input.filters,
      page,
      limit: input.limit,
      sort: { by: input.sortBy, direction: input.sortDirection },
    },
    items: rows.map((row) => {
      const inHouseStatus = coerceOrderStatus(row.order.inHouseStatus);
      return {
        id: row.order.id,
        createdAt: row.order.createdAt.toISOString(),
        updatedAt: row.order.updatedAt.toISOString(),
        customerName: getOrderFullName(
          row.order.firstName,
          row.order.lastName,
          row.order.phoneNumber1,
        ),
        phoneNumber: row.order.phoneNumber1,
        inHouseStatus: adminAiInHouseOrderStatus(inHouseStatus, row.order.noAnswerCount),
        totalAmountDzd: parseNumericAmount(row.order.totalAmount),
        delivery: {
          type: row.order.delivery === 1 ? ('stop_desk' as const) : ('home' as const),
          wilayaId: row.order.state,
          commune: row.order.city,
        },
        activeEcotrackShipment:
          row.shipmentId === null
            ? null
            : {
                provider: row.provider === 'emir' ? ('emir' as const) : ('delivro' as const),
                trackingNumber: row.trackingNumber,
                shipmentStatus: row.shipmentStatus,
                lastStatusSyncedAt: iso(row.lastStatusSyncedAt),
              },
      };
    }),
    pagination: {
      page,
      limit: input.limit,
      totalItems: total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
