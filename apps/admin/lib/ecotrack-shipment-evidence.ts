import { createHash } from 'node:crypto';

import type {
  EcotrackMajEntry as UpstreamEcotrackMajEntry,
  EcotrackOrderInfo,
  EcotrackOrderSummary,
  EcotrackStatusItem,
  EcotrackTrackingInfo,
} from '@bric/storefront-core/ecotrack-client';
import { readEcotrackActivityTimestamp } from '@bric/storefront-core/ecotrack-tracking';

import { ecotrackOrderActivities, ecotrackOrderStatusObservations } from '@bric/db/schema';
import { getEcotrackProviderEnv } from './ecotrack';
import { parseEcotrackProviderTimestamp, sanitizeNullableText } from './ecotrack-shipment-status';
import type { EcotrackShipmentRow, EcotrackTransaction } from './ecotrack-shipment-types';

function sourceKey(parts: unknown[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function validDateOnly(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export async function persistStatusEvidence(
  tx: EcotrackTransaction,
  row: EcotrackShipmentRow,
  input: {
    statusItem: EcotrackStatusItem;
    orderInfo?: EcotrackOrderInfo | EcotrackOrderSummary | null;
    observedAt: Date;
  },
) {
  const latestActivityAt =
    input.statusItem.activity
      .map((entry) => readEcotrackActivityTimestamp(entry))
      .filter((value): value is Date => value !== null)
      .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
  const effectiveAt =
    parseEcotrackProviderTimestamp(input.orderInfo?.last_updated_at) ?? latestActivityAt;
  const statusSourceKey = sourceKey([
    'status',
    input.statusItem.status,
    effectiveAt?.toISOString() ?? 'baseline',
  ]);

  await tx
    .insert(ecotrackOrderStatusObservations)
    .values({
      orderId: row.order.id,
      trackingNumber: row.trackingNumber,
      status: input.statusItem.status,
      effectiveAt,
      firstObservedAt: input.observedAt,
      lastObservedAt: input.observedAt,
      source: input.orderInfo ? 'orders_list' : 'orders_status',
      sourceKey: statusSourceKey,
      createdAt: input.observedAt,
      updatedAt: input.observedAt,
    })
    .onConflictDoUpdate({
      target: [ecotrackOrderStatusObservations.orderId, ecotrackOrderStatusObservations.sourceKey],
      set: {
        lastObservedAt: input.observedAt,
        updatedAt: input.observedAt,
      },
    });

  const activities = input.statusItem.activity.map((activity) => {
    const activityAt = readEcotrackActivityTimestamp(activity);
    const postponedTo = validDateOnly(activity.postponed_to);
    return {
      orderId: row.order.id,
      trackingNumber: row.trackingNumber,
      reason: sanitizeNullableText(activity.reason),
      details: sanitizeNullableText(activity.details),
      effectiveAt: activityAt,
      postponedTo,
      firstObservedAt: input.observedAt,
      lastObservedAt: input.observedAt,
      sourceKey: sourceKey([
        activityAt?.toISOString() ?? null,
        activity.reason ?? null,
        activity.details ?? null,
        postponedTo,
      ]),
      createdAt: input.observedAt,
      updatedAt: input.observedAt,
    };
  });

  if (activities.length > 0) {
    await tx
      .insert(ecotrackOrderActivities)
      .values(activities)
      .onConflictDoUpdate({
        target: [ecotrackOrderActivities.orderId, ecotrackOrderActivities.sourceKey],
        set: {
          lastObservedAt: input.observedAt,
          updatedAt: input.observedAt,
        },
      });
  }
}

export function providerRequestOptions(row: Pick<EcotrackShipmentRow, 'provider'>) {
  return { env: getEcotrackProviderEnv(row.provider === 'emir' ? 'emir' : 'delivro') };
}

export function mapMajEntry(entry: UpstreamEcotrackMajEntry) {
  const parsed = new Date(entry.created_at);
  return {
    remarque: entry.remarque,
    station: sanitizeNullableText(entry.station),
    livreur: sanitizeNullableText(entry.livreur),
    remoteCreatedAt: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
    raw: entry,
  };
}

export function mapTrackingInfoEvents(
  orderId: number,
  trackingNumber: string,
  trackingInfo: EcotrackTrackingInfo,
  rawTrackingInfo?: unknown,
) {
  const rawActivity =
    rawTrackingInfo &&
    typeof rawTrackingInfo === 'object' &&
    Array.isArray((rawTrackingInfo as Record<string, unknown>).activity)
      ? ((rawTrackingInfo as Record<string, unknown>).activity as unknown[])
      : [];
  return trackingInfo.activity
    .map((entry, index) => ({
      orderId,
      trackingNumber,
      eventDate: entry.date,
      eventTime: entry.time,
      status: entry.status,
      scanLocation: sanitizeNullableText(entry.scanLocation),
      raw: rawActivity[index] ?? entry,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    .filter((entry) => Boolean(entry.eventDate && entry.eventTime && entry.status));
}
