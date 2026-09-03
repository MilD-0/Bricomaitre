import type { OrderRecord, OrderStatus } from '../../lib/orders';
import { ORDER_STATUS } from '../../lib/orders';

const ORDER_OPERATING_TIME_ZONE = 'Africa/Algiers';

export const orderStatusOptions: OrderStatus[] = [
  ORDER_STATUS.NOT_CONTACTED,
  ORDER_STATUS.NO_ANSWER,
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.POSTED,
  ORDER_STATUS.DISPATCHED,
  ORDER_STATUS.IN_DELIVERY,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.MANUAL_COMPLETED,
  ORDER_STATUS.DELAYED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.FAILED,
];

const successfulStatuses = new Set<OrderStatus>([
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.MANUAL_COMPLETED,
]);
const attentionStatuses = new Set<OrderStatus>([ORDER_STATUS.NO_ANSWER, ORDER_STATUS.DELAYED]);
const unsuccessfulStatuses = new Set<OrderStatus>([
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.FAILED,
]);
const carrierStatuses = new Set<OrderStatus>([
  ORDER_STATUS.DISPATCHED,
  ORDER_STATUS.IN_DELIVERY,
  ORDER_STATUS.POSTED,
]);

export function formatOrderMoney(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatOrderDate(locale: string, value: string, includeTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
    timeZone: ORDER_OPERATING_TIME_ZONE,
  }).format(date);
}

export function formatOrderListTimestamp(locale: string, value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const day = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: ORDER_OPERATING_TIME_ZONE,
  }).format(date);
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    timeZone: ORDER_OPERATING_TIME_ZONE,
  }).format(date);

  return `${day} · ${time}`;
}

export function orderStatusTone(status: OrderStatus) {
  if (successfulStatuses.has(status)) return 'bg-emerald-500';
  if (attentionStatuses.has(status)) return 'bg-amber-500';
  if (unsuccessfulStatuses.has(status)) return 'bg-rose-500';
  if (carrierStatuses.has(status)) return 'bg-sky-500';
  return 'bg-muted-foreground/55';
}

export function summarizeOrderProducts(order: OrderRecord) {
  const first = order.orderProducts[0];
  if (!first) return '—';
  const additional = order.orderProducts.length - 1;
  return `${first.title}${additional > 0 ? ` +${additional}` : ''}`;
}
