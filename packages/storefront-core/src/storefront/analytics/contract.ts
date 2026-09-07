import type { getDb } from '@bric/db/client';
import { z } from 'zod';

export type Database = ReturnType<typeof getDb>;

export const ANALYTICS_CLIENT_TIMESTAMP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const ANALYTICS_MAX_ITEMS = 50;

export const ANALYTICS_MAX_QUANTITY = 50;

export const ANALYTICS_MAX_METADATA_BYTES = 12 * 1024;

const ANALYTICS_MAX_METADATA_DEPTH = 4;

const ANALYTICS_MAX_METADATA_KEYS = 64;

const ANALYTICS_MAX_METADATA_NODES = 500;

const ANALYTICS_MAX_METADATA_STRING_LENGTH = 2_048;

const nullableTrimmedString = (max: number) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value == null) {
        return null;
      }

      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, max);
    });

const nullablePositiveInt = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === '') {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number(String(value));
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  });

const nullableQuantity = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(String(value));
    return Number.isInteger(parsed) && parsed > 0 && parsed <= ANALYTICS_MAX_QUANTITY
      ? parsed
      : null;
  });

const nullablePositiveNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === '') {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number(String(value));
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000_000 ? parsed : null;
  });

function validateAnalyticsMetadata(value: unknown) {
  let nodes = 0;

  function visit(current: unknown, depth: number): boolean {
    nodes += 1;
    if (nodes > ANALYTICS_MAX_METADATA_NODES || depth > ANALYTICS_MAX_METADATA_DEPTH) {
      return false;
    }
    if (current === null || typeof current === 'boolean') return true;
    if (typeof current === 'number') return Number.isFinite(current);
    if (typeof current === 'string') {
      return current.length <= ANALYTICS_MAX_METADATA_STRING_LENGTH;
    }
    if (Array.isArray(current)) {
      return (
        current.length <= ANALYTICS_MAX_ITEMS && current.every((entry) => visit(entry, depth + 1))
      );
    }
    if (typeof current !== 'object') return false;

    const entries = Object.entries(current);
    return (
      entries.length <= ANALYTICS_MAX_METADATA_KEYS &&
      entries.every(
        ([key, entry]) => key.length <= 80 && key !== '__proto__' && visit(entry, depth + 1),
      )
    );
  }

  if (!visit(value, 0)) return false;
  try {
    return (
      new TextEncoder().encode(JSON.stringify(value)).byteLength <= ANALYTICS_MAX_METADATA_BYTES
    );
  } catch {
    return false;
  }
}

export function normalizeAnalyticsOccurredAt(value: string, now = new Date()) {
  const occurredAt = Date.parse(value);
  const tooOld = occurredAt < now.getTime() - ANALYTICS_CLIENT_TIMESTAMP_MAX_AGE_MS;
  const inFuture = occurredAt > now.getTime();
  return tooOld || inFuture ? now.toISOString() : value;
}

const analyticsOccurredAtSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => normalizeAnalyticsOccurredAt(value));

export const storefrontAnalyticsEventNameSchema = z.enum([
  'session_start',
  'page_view',
  'select_item',
  'view_item_list',
  'view_item',
  'view_item_media',
  'search',
  'filter_apply',
  'sort_change',
  'add_to_cart',
  'remove_from_cart',
  'view_cart',
  'begin_checkout',
  'checkout_submit',
  'purchase',
  'api_error',
  'buy_now_click',
  'cart_checkout_click',
  'checkout_view',
  'checkout_submit_attempt',
  'order_create_success',
  'order_create_failed',
  'order_verification_failed_after_create',
  'web_vital',
  'navigation_click',
  'navigation_menu_open',
  'locale_change',
  'ai_assistant_open',
  'ai_assistant_message',
  'ai_assistant_result_click',
  'ai_assistant_feedback',
  'ai_assistant_error',
  'ai_assistant_run',
]);

export const storefrontAnalyticsEventSchema = z.object({
  eventVersion: z.literal(1).optional(),
  eventId: z.string().trim().min(1).max(120),
  visitId: nullableTrimmedString(120),
  journeyId: z.string().trim().min(1).max(120),
  sessionId: z.string().trim().min(1).max(120),
  eventName: storefrontAnalyticsEventNameSchema,
  gaEventName: nullableTrimmedString(120),
  occurredAt: analyticsOccurredAtSchema.optional(),
  pagePath: nullableTrimmedString(2048),
  pageType: nullableTrimmedString(80),
  locale: nullableTrimmedString(12),
  referrer: nullableTrimmedString(500),
  utmSource: nullableTrimmedString(120),
  utmMedium: nullableTrimmedString(120),
  utmCampaign: nullableTrimmedString(180),
  utmTerm: nullableTrimmedString(180),
  utmContent: nullableTrimmedString(180),
  productId: nullablePositiveInt,
  productSlug: nullableTrimmedString(180),
  categoryId: nullablePositiveInt,
  categorySlug: nullableTrimmedString(180),
  brandId: nullablePositiveInt,
  brandSlug: nullableTrimmedString(180),
  orderId: nullablePositiveInt,
  searchTerm: nullableTrimmedString(1500),
  quantity: nullableQuantity,
  value: nullablePositiveNumber,
  currency: z.string().trim().min(1).max(12).default('DZD'),
  metadata: z
    .record(z.string(), z.unknown())
    .default({})
    .refine(validateAnalyticsMetadata, 'Analytics metadata exceeds its structural limits.'),
});

export type StorefrontAnalyticsEvent = z.infer<typeof storefrontAnalyticsEventSchema>;
