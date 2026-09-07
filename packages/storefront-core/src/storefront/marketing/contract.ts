import type { getDb } from '@bric/db/client';
import { marketingEventOutbox } from '@bric/db/schema';

export type Database = ReturnType<typeof getDb>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type Executor = Database | Transaction;

export type Destination = 'google' | 'tiktok';

export type OutboxRow = typeof marketingEventOutbox.$inferSelect;

export type MarketingEnvironment = Partial<
  Record<
    | 'GOOGLE_ANALYTICS_MEASUREMENT_ID'
    | 'NEXT_PUBLIC_GA_MEASUREMENT_ID'
    | 'GOOGLE_ANALYTICS_API_SECRET'
    | 'TIKTOK_PIXEL_ID'
    | 'NEXT_PUBLIC_TIKTOK_PIXEL_ID'
    | 'TIKTOK_EVENTS_API_ACCESS_TOKEN',
    string | undefined
  >
>;

export const ATTRIBUTION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export const PROCESSING_LEASE_MS = 2 * 60 * 1000;

export const MAX_ATTEMPTS = 8;

export const GOOGLE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

export const TIKTOK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const RETRY_DELAYS_MS = [
  60_000, 300_000, 900_000, 3_600_000, 21_600_000, 43_200_000,
] as const;
