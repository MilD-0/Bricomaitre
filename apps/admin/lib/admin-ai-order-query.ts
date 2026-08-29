import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { ecotrackOrderStates, orderLineItems, orders, orderStatusHistory } from '@bric/db/schema';
import {
  coerceOrderStatus,
  getOrderFullName,
  parseNumericAmount,
} from '@bric/storefront-core/order-domain';

import { loadOrderDetail } from './admin-orders-data';
import {
  ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES,
  adminAiInHouseOrderStatus,
  adminAiInHouseOrderStatusSchema,
} from './admin-ai-order-status';

const daySchema = z.iso.date();
const sortBySchema = z.enum(['createdAt', 'customerName', 'inHouseStatus', 'totalAmount']);
const productGroupingSchema = z
  .object({
    dimension: z.literal('product'),
    sortBy: z.enum(['orderCount', 'units']).optional(),
    direction: z.enum(['asc', 'desc']).optional(),
  })
  .strict();
const dateScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('day'), date: daySchema }).strict(),
  z.object({ kind: z.literal('range'), from: daySchema, to: daySchema }).strict(),
  z.object({ kind: z.literal('since'), date: daySchema }).strict(),
  z.object({ kind: z.literal('through'), date: daySchema }).strict(),
]);

const statusHistoryFilterSchema = z
  .object({
    field: z.literal('in_house_status_history'),
    statuses: z.array(adminAiInHouseOrderStatusSchema).min(1).max(12),
    date: dateScopeSchema.optional(),
  })
  .strict();

const createdFilterSchema = z
  .object({
    field: z.literal('created_date'),
    date: dateScopeSchema,
  })
  .strict();

const orderFilterSchema = z.discriminatedUnion('field', [
  z
    .object({
      field: z.literal('current_in_house_status'),
      statuses: z.array(adminAiInHouseOrderStatusSchema).min(1).max(12),
    })
    .strict(),
  statusHistoryFilterSchema,
  z
    .object({
      field: z.literal('product'),
      productIds: z.array(z.number().int().positive()).min(1).max(100),
    })
    .strict(),
  createdFilterSchema,
  z
    .object({
      field: z.literal('ecotrack_link'),
      state: z.enum(['active', 'none']),
    })
    .strict(),
  z
    .object({
      field: z.literal('ecotrack_shipment_status'),
      statuses: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
    })
    .strict(),
  z
    .object({
      field: z.literal('no_answer_count'),
      count: z.number().int().min(1).max(99),
    })
    .strict(),
]);

export const adminAiOrderQuerySchema = z
  .object({
    search: z.string().trim().min(1).max(200).optional(),
    filters: z.array(orderFilterSchema).max(8).optional(),
    groupBy: productGroupingSchema.optional(),
    page: z.number().int().positive().optional(),
    limit: z.number().int().min(1).max(50).optional(),
    sort: z
      .object({
        by: sortBySchema,
        direction: z.enum(['asc', 'desc']).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.groupBy && value.sort) {
      context.addIssue({
        code: 'custom',
        message: 'Use groupBy.sortBy for grouped results; order-row sorting does not apply.',
        path: ['sort'],
      });
    }
    value.filters?.forEach((filter, index) => {
      if (
        (filter.field === 'created_date' || filter.field === 'in_house_status_history') &&
        filter.date?.kind === 'range' &&
        filter.date.from > filter.date.to
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Date range from must not be after to.',
          path: ['filters', index, 'date', 'from'],
        });
      }
    });
  });

export const adminAiOrderInspectionSchema = z
  .object({ orderIds: z.array(z.number().int().positive()).min(1).max(20) })
  .strict();

export const ADMIN_AI_QUERY_ORDERS_TOOL_DESCRIPTION =
  'Query local orders. Add only useful filters; date scopes distinguish one day, a range, since, and through. Returns lightweight rows and an exact total. Optionally group the matched population by captured product for exact order and unit counts. Use inspect_orders for exact order detail.';

export const ADMIN_AI_INSPECT_ORDERS_TOOL_DESCRIPTION =
  'Read exact local orders with captured commercial facts, in-house status history, and the stored active or deleted EcoTrack shipment summary. This does not refresh the carrier.';

function normalizeOrderQuery(input: z.output<typeof adminAiOrderQuerySchema>) {
  const filters = input.filters ?? [];
  const currentStatus = filters.find((filter) => filter.field === 'current_in_house_status');
  const statusHistory = filters.find((filter) => filter.field === 'in_house_status_history');
  const products = filters.find((filter) => filter.field === 'product');
  const created = filters.find((filter) => filter.field === 'created_date');
  const ecotrackLink = filters.find((filter) => filter.field === 'ecotrack_link');
  const ecotrackStatus = filters.find((filter) => filter.field === 'ecotrack_shipment_status');
  const noAnswer = filters.find((filter) => filter.field === 'no_answer_count');
  const dateBounds = (scope: z.output<typeof dateScopeSchema> | undefined) => {
    if (!scope) return {};
    if (scope.kind === 'day') return { from: scope.date, to: scope.date };
    if (scope.kind === 'range') return { from: scope.from, to: scope.to };
    if (scope.kind === 'since') return { from: scope.date };
    return { to: scope.date };
  };
  const createdDates = dateBounds(created?.field === 'created_date' ? created.date : undefined);
  const historyDates = dateBounds(
    statusHistory?.field === 'in_house_status_history' ? statusHistory.date : undefined,
  );
  return {
    search: input.search ?? '',
    filters,
    currentInHouseStatuses:
      currentStatus?.field === 'current_in_house_status' ? currentStatus.statuses : [],
    noAnswerCount: noAnswer?.field === 'no_answer_count' ? noAnswer.count : undefined,
    statusHistory:
      statusHistory?.field === 'in_house_status_history'
        ? { ...statusHistory, changedFrom: historyDates.from, changedTo: historyDates.to }
        : undefined,
    productIds: products?.field === 'product' ? products.productIds : [],
    createdFrom: createdDates.from,
    createdTo: createdDates.to,
    ecotrackLink:
      ecotrackLink?.field === 'ecotrack_link'
        ? ecotrackLink.state
        : ecotrackStatus
          ? ('active' as const)
          : ('any' as const),
    ecotrackShipmentStatuses:
      ecotrackStatus?.field === 'ecotrack_shipment_status' ? ecotrackStatus.statuses : [],
    groupBy: input.groupBy
      ? {
          dimension: input.groupBy.dimension,
          sortBy: input.groupBy.sortBy ?? ('orderCount' as const),
          direction: input.groupBy.direction ?? ('desc' as const),
        }
      : undefined,
    page: input.page ?? 1,
    limit: input.limit ?? 20,
    sortBy: input.sort?.by ?? ('createdAt' as const),
    sortDirection: input.sort?.direction ?? ('desc' as const),
  };
}

function fromDay(column: unknown, day: string) {
  return sql`${column} >= ((${day}::date)::timestamp at time zone 'Africa/Algiers')`;
}

function throughDay(column: unknown, day: string) {
  return sql`${column} < ((((${day}::date + 1))::timestamp) at time zone 'Africa/Algiers')`;
}

function statusValues(statuses: readonly (keyof typeof ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES)[]) {
  return statuses.map((status) => ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES[status]);
}

function queryConditions(input: ReturnType<typeof normalizeOrderQuery>) {
  const conditions: SQL[] = [];
  if (input.search) {
    const pattern = `%${input.search}%`;
    const search = or(
      sql`cast(${orders.id} as text) = ${input.search}`,
      sql`concat_ws(' ', ${orders.firstName}, ${orders.lastName}) ILIKE ${pattern}`,
      ilike(orders.phoneNumber1, pattern),
      ilike(orders.phoneNumber2, pattern),
      ilike(orders.note, pattern),
      ilike(orders.homeAddress, pattern),
      ilike(orders.city, pattern),
    );
    if (search) conditions.push(search);
  }
  if (input.currentInHouseStatuses.length > 0) {
    conditions.push(inArray(orders.inHouseStatus, statusValues(input.currentInHouseStatuses)));
  }
  if (input.noAnswerCount !== undefined) {
    if (input.currentInHouseStatuses.length === 0) {
      conditions.push(eq(orders.inHouseStatus, ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES.no_answer));
    }
    conditions.push(eq(orders.noAnswerCount, input.noAnswerCount));
  }
  if (input.createdFrom) conditions.push(fromDay(orders.createdAt, input.createdFrom));
  if (input.createdTo) conditions.push(throughDay(orders.createdAt, input.createdTo));
  if (input.ecotrackLink === 'active') conditions.push(isNotNull(ecotrackOrderStates.id));
  if (input.ecotrackLink === 'none') conditions.push(isNull(ecotrackOrderStates.id));
  if (input.ecotrackShipmentStatuses.length > 0) {
    conditions.push(inArray(ecotrackOrderStates.currentStatus, input.ecotrackShipmentStatuses));
  }
  if (input.productIds.length > 0) {
    conditions.push(sql`exists (
      select 1 from ${orderLineItems}
      where ${orderLineItems.orderId} = ${orders.id}
        and ${inArray(orderLineItems.productId, input.productIds)}
    )`);
  }
  if (input.statusHistory) {
    const historyConditions: SQL[] = [
      eq(orderStatusHistory.orderId, orders.id),
      inArray(orderStatusHistory.status, statusValues(input.statusHistory.statuses)),
    ];
    if (input.statusHistory.changedFrom) {
      historyConditions.push(
        fromDay(orderStatusHistory.changedAt, input.statusHistory.changedFrom),
      );
    }
    if (input.statusHistory.changedTo) {
      historyConditions.push(
        throughDay(orderStatusHistory.changedAt, input.statusHistory.changedTo),
      );
    }
    conditions.push(sql`exists (
      select 1 from ${orderStatusHistory}
      where ${and(...historyConditions)}
    )`);
  }
  return and(...conditions);
}

function orderBy(input: ReturnType<typeof normalizeOrderQuery>) {
  const direction = input.sortDirection === 'asc' ? asc : desc;
  const primary =
    input.sortBy === 'customerName'
      ? sql`coalesce(nullif(trim(concat_ws(' ', ${orders.firstName}, ${orders.lastName})), ''), ${orders.phoneNumber1})`
      : input.sortBy === 'inHouseStatus'
        ? orders.inHouseStatus
        : input.sortBy === 'totalAmount'
          ? orders.totalAmount
          : orders.createdAt;
  return [direction(primary), desc(orders.id)] as const;
}

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

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

function storedShipment(row: typeof ecotrackOrderStates.$inferSelect | undefined) {
  if (!row) return null;
  return {
    state: row.deletedAt ? ('deleted' as const) : ('active' as const),
    provider: row.provider === 'emir' ? ('emir' as const) : ('delivro' as const),
    reference: row.reference,
    trackingNumber: row.trackingNumber,
    shipmentStatus: row.currentStatus,
    amountDzd: row.currentAmount === null ? null : parseNumericAmount(row.currentAmount),
    deliveryTariffDzd: row.deliveryTariff === null ? null : parseNumericAmount(row.deliveryTariff),
    returnTariffDzd: row.returnTariff === null ? null : parseNumericAmount(row.returnTariff),
    providerCreatedAt: iso(row.providerCreatedAt),
    providerUpdatedAt: iso(row.providerUpdatedAt),
    lastStatusSyncedAt: iso(row.lastStatusSyncedAt),
    deletedAt: iso(row.deletedAt),
  };
}

export async function inspectAdminOrderDetails(raw: z.input<typeof adminAiOrderInspectionSchema>) {
  const input = adminAiOrderInspectionSchema.parse(raw);
  const requestedIds = [...new Set(input.orderIds)];
  const db = getDb();
  const [loadedOrders, shipments] = await Promise.all([
    Promise.all(requestedIds.map((orderId) => loadOrderDetail(orderId))),
    Promise.all(
      requestedIds.map((orderId) =>
        db.query.ecotrackOrderStates.findFirst({
          where: (state, { eq }) => eq(state.orderId, orderId),
        }),
      ),
    ),
  ]);
  const shipmentByOrderId = new Map(
    shipments.flatMap((shipment) => (shipment ? [[shipment.orderId, shipment] as const] : [])),
  );

  return {
    kind: 'order_details' as const,
    requestedIds,
    missingIds: requestedIds.filter((_, index) => loadedOrders[index] === null),
    items: loadedOrders.flatMap((item) => {
      if (!item) return [];
      const {
        inHouseStatus,
        statusHistory,
        ecotrackTrackingNumber: _ecotrackTrackingNumber,
        hasStatusHistory: _hasStatusHistory,
        ...order
      } = item;
      void _ecotrackTrackingNumber;
      void _hasStatusHistory;
      return [
        {
          ...order,
          inHouseStatus: adminAiInHouseOrderStatus(inHouseStatus, item.noAnswerCount),
          inHouseStatusHistory: statusHistory.map(({ status, ...entry }) => ({
            ...entry,
            inHouseStatus: adminAiInHouseOrderStatus(status, entry.noAnswerCount),
          })),
          ecotrackShipment: storedShipment(shipmentByOrderId.get(item.id)),
        },
      ];
    }),
  };
}
