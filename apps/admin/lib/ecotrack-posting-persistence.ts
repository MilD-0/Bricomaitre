import { eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { updateCanonicalOrder } from '@bric/storefront-core/order-write';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { ecotrackOrderStates } from '@bric/db/schema';
import { recordExplicitActionLog, type ActionActor } from './action-history';
import {
  areEcotrackActionSnapshotsEqual,
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from './ecotrack-action-snapshots';
import type { EcotrackCreateOrderResult, EcotrackOrderInput } from './ecotrack-posting';
import type { EcotrackProvider } from './ecotrack-provider';
import { coerceOrderStatus } from './orders';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';
function resolveEcotrackActor(actor?: ActionActor | null): ActionActor {
  if (actor?.email || actor?.name) {
    return actor;
  }

  return {
    email: null,
    name: ECOTRACK_SYNC_ACTOR_NAME,
  };
}

async function recordEcotrackOrderAction(
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

async function recordEcotrackShipmentAction(
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

export async function persistEcotrackPostedOrder(
  db: Database,
  input: EcotrackOrderInput,
  actor: { email?: string | null; name?: string | null },
  createResult: EcotrackCreateOrderResult,
  provider: EcotrackProvider = 'delivro',
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [existingShipment] = await tx
      .select()
      .from(ecotrackOrderStates)
      .where(eq(ecotrackOrderStates.orderId, input.row.id))
      .limit(1);
    const beforeOrderState = buildEcotrackOrderActionSnapshot(input.row);
    const beforeShipmentState = existingShipment
      ? buildEcotrackShipmentActionSnapshot(existingShipment)
      : null;

    await updateCanonicalOrder(tx, {
      orderId: input.row.id,
      status: {
        value: existingShipment ? coerceOrderStatus(input.row.inHouseStatus) : ORDER_STATUS.POSTED,
        noAnswerCount: 0,
      },
      actor,
      now,
      values: {
        ecotrackReference: String(input.row.id),
        ecotrackTrackingNumber: createResult.tracking,
        ecotrackStatus: 'prete_a_expedier',
        ecotrackStatusLastUpdate: now,
        ecotrackStatusData: {
          source: 'admin_direct_post',
          create: createResult.raw,
          currentStatus: 'prete_a_expedier',
          updatedAt: now.toISOString(),
        },
        confirmedBy: actor.email ?? input.row.confirmedBy ?? null,
        confirmedByName: actor.name ?? input.row.confirmedByName ?? null,
        confirmedAt: input.row.confirmedAt ?? now,
      },
    });

    await tx
      .insert(ecotrackOrderStates)
      .values({
        orderId: input.row.id,
        reference: String(input.row.id),
        trackingNumber: createResult.tracking ?? '',
        provider,
        currentStatus: 'prete_a_expedier',
        currentAmount: String(input.record.totalAmount),
        currentAmountSource: 'submitted_order',
        stopDesk: input.record.delivery === 1,
        providerCreatedAt: now,
        rawCreatePayload: createResult.raw,
        rawStatusPayload: {
          currentStatus: 'prete_a_expedier',
          createMessage: createResult.message ?? null,
        },
        lastActionAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: ecotrackOrderStates.orderId,
        set: {
          reference: String(input.row.id),
          trackingNumber: createResult.tracking ?? '',
          provider,
          currentStatus: 'prete_a_expedier',
          currentAmount: String(input.record.totalAmount),
          currentAmountSource: 'submitted_order',
          deliveryTariff: null,
          returnTariff: null,
          stopDesk: input.record.delivery === 1,
          paymentId: null,
          statusReason: null,
          providerCreatedAt: now,
          providerUpdatedAt: null,
          driverPhone: null,
          estimatedFee: null,
          deskPhone: null,
          deskCommune: null,
          deskMapLink: null,
          deskAddress: null,
          rawCreatePayload: createResult.raw,
          rawStatusPayload: {
            currentStatus: 'prete_a_expedier',
            createMessage: createResult.message ?? null,
          },
          rawLastTrackingPayload: null,
          rawLastMajPayload: null,
          rawOrderPayload: null,
          lastStatusSyncedAt: null,
          lastTrackingSyncedAt: null,
          lastMajSyncedAt: null,
          lastOrderSyncedAt: null,
          deletedAt: null,
          lastActionAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });

    const afterOrderState = {
      ...beforeOrderState,
      inHouseStatus: existingShipment ? input.row.inHouseStatus : ORDER_STATUS.POSTED,
      noAnswerCount: 0,
      ecotrackReference: String(input.row.id),
      ecotrackTrackingNumber: createResult.tracking,
      ecotrackStatus: 'prete_a_expedier',
      ecotrackStatusLastUpdate: now,
      ecotrackStatusData: {
        source: 'admin_direct_post',
        create: createResult.raw,
        currentStatus: 'prete_a_expedier',
        updatedAt: now.toISOString(),
      },
      confirmedBy: actor.email ?? input.row.confirmedBy ?? null,
      confirmedByName: actor.name ?? input.row.confirmedByName ?? null,
      confirmedAt: input.row.confirmedAt ?? now,
      updatedAt: now,
    };
    const afterShipmentState = {
      ...(beforeShipmentState ?? {
        id: existingShipment?.id ?? input.row.id,
        orderId: input.row.id,
        reference: String(input.row.id),
        trackingNumber: createResult.tracking ?? '',
        provider,
        currentStatus: 'prete_a_expedier',
        driverPhone: null,
        estimatedFee: null,
        deskPhone: null,
        deskCommune: null,
        deskMapLink: null,
        deskAddress: null,
        rawLastTrackingPayload: null,
        rawLastMajPayload: null,
        lastStatusSyncedAt: null,
        lastTrackingSyncedAt: null,
        lastMajSyncedAt: null,
        deletedAt: null,
        createdAt: now,
      }),
      reference: String(input.row.id),
      trackingNumber: createResult.tracking ?? '',
      currentStatus: 'prete_a_expedier',
      currentAmount: String(input.record.totalAmount),
      currentAmountSource: 'submitted_order',
      deliveryTariff: null,
      returnTariff: null,
      stopDesk: input.record.delivery === 1,
      paymentId: null,
      statusReason: null,
      providerCreatedAt: now,
      providerUpdatedAt: null,
      driverPhone: null,
      estimatedFee: null,
      deskPhone: null,
      deskCommune: null,
      deskMapLink: null,
      deskAddress: null,
      rawCreatePayload: createResult.raw,
      rawStatusPayload: {
        currentStatus: 'prete_a_expedier',
        createMessage: createResult.message ?? null,
      },
      rawLastTrackingPayload: null,
      rawLastMajPayload: null,
      rawOrderPayload: null,
      lastStatusSyncedAt: null,
      lastTrackingSyncedAt: null,
      lastMajSyncedAt: null,
      lastOrderSyncedAt: null,
      lastActionAt: now,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await recordEcotrackOrderAction(tx, beforeOrderState, afterOrderState, actor);
    await recordEcotrackShipmentAction(
      tx,
      input.row.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      beforeShipmentState ? 'update' : 'create',
    );
  });
}
