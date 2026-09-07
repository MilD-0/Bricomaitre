import type { getDb } from '@bric/db/client';

export type Database = ReturnType<typeof getDb>;

export const ANALYTICS_RAW_RETENTION_DAYS = 7;

export const ANALYTICS_ERROR_RETENTION_DAYS = 30;

export const META_DELIVERED_RETENTION_DAYS = 7;

export const META_FAILED_RETENTION_DAYS = 30;

export const MARKETING_ACCEPTED_RETENTION_DAYS = 7;

export const MARKETING_FAILED_RETENTION_DAYS = 30;

export const STOREFRONT_MAINTENANCE_BATCH_SIZE = 5_000;

export const PAID_CLICK_ROLLUP_NORMALIZATION_BATCH_DAYS = 31;

export function daysBefore(now: Date, days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function deletedCount(result: { rows?: unknown[] }) {
  return result.rows?.length ?? 0;
}
