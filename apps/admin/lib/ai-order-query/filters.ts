import { ecotrackOrderStates, orderLineItems, orders, orderStatusHistory } from '@bric/db/schema';
import {
  and,
  asc,
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
import { ADMIN_AI_IN_HOUSE_ORDER_STATUS_VALUES } from '../admin-ai-order-status';
import { orderProductSearchCondition } from '../order-product-search';
import { orderCitySearchCondition } from '../order-search';
import { adminAiOrderQuerySchema, dateScopeSchema } from './contract';

export function normalizeOrderQuery(input: z.output<typeof adminAiOrderQuerySchema>) {
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

export function queryConditions(input: ReturnType<typeof normalizeOrderQuery>) {
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
      orderCitySearchCondition(input.search),
      orderProductSearchCondition(input.search),
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

export function orderBy(input: ReturnType<typeof normalizeOrderQuery>) {
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

export function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}
