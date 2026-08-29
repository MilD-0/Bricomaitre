import { eq, max, sql } from 'drizzle-orm';

import { ecotrackOrderMajEntries, ecotrackOrderTrackingEvents } from '@bric/db/schema';
import { recordExplicitActionLog, type ActionActor } from './action-history';
import {
  areEcotrackActionSnapshotsEqual,
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from './ecotrack-action-snapshots';
import type {
  EcotrackDatabase as Database,
  EcotrackTransaction as Transaction,
} from './ecotrack-shipment-types';

export const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';

export function resolveEcotrackActor(actor?: ActionActor | null): ActionActor {
  if (actor?.email || actor?.name) return actor;
  return { email: null, name: ECOTRACK_SYNC_ACTOR_NAME };
}

export async function loadMajSyncSummary(
  tx: Database | Transaction,
  orderId: number,
  trackingNumber: string,
) {
  const [row] = await tx
    .select({
      entryCount: sql<number>`count(*)::int`,
      latestRemoteCreatedAt: max(ecotrackOrderMajEntries.remoteCreatedAt),
    })
    .from(ecotrackOrderMajEntries)
    .where(eq(ecotrackOrderMajEntries.orderId, orderId));

  return {
    orderId,
    trackingNumber,
    entryCount: Number(row?.entryCount ?? 0),
    latestRemoteCreatedAt: row?.latestRemoteCreatedAt ?? null,
  };
}

export async function loadTrackingSyncSummary(
  tx: Database | Transaction,
  orderId: number,
  trackingNumber: string,
) {
  const [row] = await tx
    .select({
      eventCount: sql<number>`count(*)::int`,
      latestEventDate: max(ecotrackOrderTrackingEvents.eventDate),
    })
    .from(ecotrackOrderTrackingEvents)
    .where(eq(ecotrackOrderTrackingEvents.orderId, orderId));

  return {
    orderId,
    trackingNumber,
    eventCount: Number(row?.eventCount ?? 0),
    latestEventAt: row?.latestEventDate ?? null,
  };
}

export async function recordEcotrackOrderAction(
  tx: Transaction,
  beforeState: ReturnType<typeof buildEcotrackOrderActionSnapshot>,
  afterState: ReturnType<typeof buildEcotrackOrderActionSnapshot>,
  actor?: ActionActor | null,
) {
  const compactBeforeState = buildEcotrackOrderActionSnapshot(beforeState);
  const compactAfterState = buildEcotrackOrderActionSnapshot(afterState);
  if (areEcotrackActionSnapshotsEqual(compactBeforeState, compactAfterState)) {
    return;
  }

  await recordExplicitActionLog(tx, {
    entityType: 'orders',
    entityId: beforeState.id,
    operation: 'update',
    beforeState: compactBeforeState,
    afterState: compactAfterState,
    actor: resolveEcotrackActor(actor),
    isReversible: false,
  });
}

export async function recordEcotrackShipmentAction(
  tx: Transaction,
  orderId: number,
  beforeState: ReturnType<typeof buildEcotrackShipmentActionSnapshot> | null,
  afterState: ReturnType<typeof buildEcotrackShipmentActionSnapshot> | null,
  actor?: ActionActor | null,
  operation?: 'create' | 'update' | 'delete',
) {
  const compactBeforeState = beforeState ? buildEcotrackShipmentActionSnapshot(beforeState) : null;
  const compactAfterState = afterState ? buildEcotrackShipmentActionSnapshot(afterState) : null;
  if (
    operation === 'update' &&
    compactBeforeState &&
    compactAfterState &&
    areEcotrackActionSnapshotsEqual(compactBeforeState, compactAfterState)
  ) {
    return;
  }

  const nextOperation =
    operation ?? (compactBeforeState ? (compactAfterState ? 'update' : 'delete') : 'create');

  await recordExplicitActionLog(tx, {
    entityType: 'ecotrackShipments',
    entityId: orderId,
    operation: nextOperation,
    beforeState: compactBeforeState,
    afterState: compactAfterState,
    actor: resolveEcotrackActor(actor),
  });
}

export async function recordEcotrackMajAction(
  tx: Transaction,
  orderId: number,
  beforeState: Awaited<ReturnType<typeof loadMajSyncSummary>>,
  afterState: Awaited<ReturnType<typeof loadMajSyncSummary>>,
  actor?: ActionActor | null,
) {
  if (areEcotrackActionSnapshotsEqual(beforeState, afterState)) {
    return;
  }

  await recordExplicitActionLog(tx, {
    entityType: 'ecotrackShipmentMajSync',
    entityId: orderId,
    operation: 'update',
    beforeState,
    afterState,
    actor: resolveEcotrackActor(actor),
  });
}

export async function recordEcotrackTrackingAction(
  tx: Transaction,
  orderId: number,
  beforeState: Awaited<ReturnType<typeof loadTrackingSyncSummary>>,
  afterState: Awaited<ReturnType<typeof loadTrackingSyncSummary>>,
  actor?: ActionActor | null,
) {
  if (areEcotrackActionSnapshotsEqual(beforeState, afterState)) {
    return;
  }

  await recordExplicitActionLog(tx, {
    entityType: 'ecotrackShipmentTrackingSync',
    entityId: orderId,
    operation: 'update',
    beforeState,
    afterState,
    actor: resolveEcotrackActor(actor),
  });
}
