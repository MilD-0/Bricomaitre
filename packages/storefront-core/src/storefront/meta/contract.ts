import type { getDb } from '@bric/db/client';
import { metaEventOutbox } from '@bric/db/schema';
import { ORDER_STATUS } from '../../orders-support';

export type Database = ReturnType<typeof getDb>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type Executor = Database | Transaction;

export const META_ORDER_CONFIRMED_STATUSES = [ORDER_STATUS.CONFIRMED] as const;

export const META_COMPLETED_STATUSES = [
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.MANUAL_COMPLETED,
] as const;

export const META_ORDER_CONFIRMED_EVENT_NAME = 'orderconfirmed' as const;

export const META_ORDER_COMPLETED_EVENT_NAME = 'OrderCompleted' as const;

export const META_EVENT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const META_FUTURE_TOLERANCE_MS = 60 * 1000;

export const META_ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const META_PROCESSING_LEASE_MS = 2 * 60 * 1000;

export const META_MAX_ATTEMPTS = 8;

export const META_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export type MetaCommerceLine = {
  productId: number;
  contentId: string;
  rawValue: string;
  title: string;
  originalUnitPrice: number;
  effectiveUnitPrice: number;
  unitPurchasePrice: number | null;
  quantity: number;
  discountAmount: number;
  lineTotal: number;
  thumbnailUrl: string | null;
};

export type MetaProductDimension = {
  productId: number;
  productSlug: string | null;
  categoryId: number | null;
  brandId: number | null;
};

export type MetaOutboxRow = typeof metaEventOutbox.$inferSelect;

export function getOrderConfirmedEventId(orderId: number) {
  return `order:${orderId}:confirmed:v1`;
}

export function getOrderCompletedEventId(orderId: number) {
  return `order:${orderId}:completed:v1`;
}

export function isMetaOrderConfirmedStatus(status: number) {
  return (META_ORDER_CONFIRMED_STATUSES as readonly number[]).includes(status);
}

export function isMetaCompletedStatus(status: number) {
  return (META_COMPLETED_STATUSES as readonly number[]).includes(status);
}

export function normalizeMetaEventTime(value: Date, now = new Date()) {
  if (value.getTime() < now.getTime() - META_EVENT_MAX_AGE_MS) {
    return { kind: 'expired' as const, value };
  }
  if (value.getTime() > now.getTime() + META_FUTURE_TOLERANCE_MS) {
    return { kind: 'clamped' as const, value: now };
  }
  return { kind: 'valid' as const, value };
}

export type MetaSendResult =
  | {
      ok: true;
      status: number;
      eventsReceived: number;
      fbtraceId: string | null;
    }
  | {
      ok: false;
      retryable: boolean;
      status: number | null;
      retryAfterMs: number | null;
      code: number | null;
      subcode: number | null;
      message: string;
      fbtraceId: string | null;
    };

export type MetaOrderStatusInput = {
  orderId: number;
  statusHistoryId: number;
  status: number;
  changedAt: Date;
};
