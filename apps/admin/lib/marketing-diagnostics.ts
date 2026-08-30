import { desc, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { marketingEventOutbox } from '@bric/db/schema';

const OPTIONAL_MARKETING_DESTINATIONS = ['google', 'tiktok'] as const;
type OptionalMarketingDestination = (typeof OPTIONAL_MARKETING_DESTINATIONS)[number];
type DestinationConfiguration = 'enabled' | 'disabled' | 'unknown';
type DestinationEnvironment = Partial<
  Record<
    'MARKETING_GOOGLE_DESTINATION_ENABLED' | 'MARKETING_TIKTOK_DESTINATION_ENABLED',
    string | undefined
  >
>;

function readDestinationConfiguration(value: string | undefined): DestinationConfiguration {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true') return 'enabled';
  if (normalized === 'false') return 'disabled';
  return 'unknown';
}

export function getMarketingDestinationConfiguration(
  env: DestinationEnvironment = process.env as DestinationEnvironment,
) {
  return {
    google: readDestinationConfiguration(env.MARKETING_GOOGLE_DESTINATION_ENABLED),
    tiktok: readDestinationConfiguration(env.MARKETING_TIKTOK_DESTINATION_ENABLED),
  } satisfies Record<OptionalMarketingDestination, DestinationConfiguration>;
}

type DestinationSummary = {
  destination: string;
  queued: number;
  processing: number;
  accepted: number;
  duplicated: number;
  rejected: number;
  retrying: number;
  exhausted: number;
  dropped: number;
  oldestPendingAt: Date | null;
  lastAcceptedAt: Date | null;
};

export function mergeMarketingDestinationConfiguration(
  summaries: DestinationSummary[],
  configuration = getMarketingDestinationConfiguration(),
) {
  const byDestination = new Map(summaries.map((summary) => [summary.destination, summary]));
  const emptySummary = {
    queued: 0,
    processing: 0,
    accepted: 0,
    duplicated: 0,
    rejected: 0,
    retrying: 0,
    exhausted: 0,
    dropped: 0,
    oldestPendingAt: null,
    lastAcceptedAt: null,
  };
  const known = OPTIONAL_MARKETING_DESTINATIONS.map((destination) => ({
    ...emptySummary,
    ...byDestination.get(destination),
    destination,
    configuration: configuration[destination],
  }));
  const unknown = summaries
    .filter(
      (summary) =>
        !OPTIONAL_MARKETING_DESTINATIONS.includes(
          summary.destination as OptionalMarketingDestination,
        ),
    )
    .map((summary) => ({ ...summary, configuration: 'unknown' as const }));
  return [...known, ...unknown];
}

export async function getMarketingDestinationDiagnostics() {
  const db = getDb();
  const [destinations, recentFailures] = await Promise.all([
    db
      .select({
        destination: marketingEventOutbox.destination,
        queued: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'queued')::int`,
        processing: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'processing')::int`,
        accepted: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'accepted')::int`,
        duplicated: sql<number>`coalesce(sum(${marketingEventOutbox.duplicateCount}), 0)::int`,
        rejected: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'rejected')::int`,
        retrying: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'retrying')::int`,
        exhausted: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'exhausted')::int`,
        dropped: sql<number>`count(*) filter (where ${marketingEventOutbox.status} = 'dropped')::int`,
        oldestPendingAt: sql<Date | null>`min(${marketingEventOutbox.createdAt}) filter (where ${marketingEventOutbox.status} in ('queued', 'processing', 'retrying'))`,
        lastAcceptedAt: sql<Date | null>`max(${marketingEventOutbox.deliveredAt})`,
      })
      .from(marketingEventOutbox)
      .groupBy(marketingEventOutbox.destination)
      .orderBy(marketingEventOutbox.destination),
    db
      .select({
        destination: marketingEventOutbox.destination,
        eventName: marketingEventOutbox.eventName,
        eventId: marketingEventOutbox.eventId,
        orderId: marketingEventOutbox.orderId,
        status: marketingEventOutbox.status,
        attemptCount: marketingEventOutbox.attemptCount,
        lastHttpStatus: marketingEventOutbox.lastHttpStatus,
        errorCode: marketingEventOutbox.errorCode,
        errorMessage: marketingEventOutbox.errorMessage,
        lastAttemptAt: marketingEventOutbox.lastAttemptAt,
      })
      .from(marketingEventOutbox)
      .where(
        sql`${marketingEventOutbox.status} in ('retrying', 'rejected', 'exhausted', 'dropped')`,
      )
      .orderBy(desc(marketingEventOutbox.lastAttemptAt))
      .limit(25),
  ]);
  return {
    destinations: mergeMarketingDestinationConfiguration(destinations),
    recentFailures,
  };
}
