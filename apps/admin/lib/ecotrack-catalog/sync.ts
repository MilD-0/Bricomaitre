import {
  ecotrackCommunes,
  ecotrackServiceFees,
  ecotrackSyncRuns,
  ecotrackWeightFees,
  ecotrackWilayas,
} from '@bric/db/schema';
import { count, desc, eq } from 'drizzle-orm';
import { recordExplicitActionLog, type ActionActor } from '../action-history';
import {
  assertCompleteEcotrackCatalogSnapshot,
  ECOTRACK_SYNC_ACTOR_NAME,
  type Database,
  type EcotrackSyncResult,
  type Transaction,
} from './contract';
import { fetchEcotrackCatalogSnapshot } from './fetch';

function resolveEcotrackActor(actor?: ActionActor | null): ActionActor {
  if (actor?.email || actor?.name) {
    return actor;
  }

  return {
    email: null,
    name: ECOTRACK_SYNC_ACTOR_NAME,
  };
}

async function readCatalogCounts(tx: Database | Transaction) {
  const [
    [{ value: wilayaCount }],
    [{ value: communeCount }],
    [{ value: serviceFeeCount }],
    [{ value: weightFeeCount }],
  ] = await Promise.all([
    tx.select({ value: count() }).from(ecotrackWilayas),
    tx.select({ value: count() }).from(ecotrackCommunes),
    tx.select({ value: count() }).from(ecotrackServiceFees),
    tx.select({ value: count() }).from(ecotrackWeightFees),
  ]);

  return {
    wilayaCount,
    communeCount,
    serviceFeeCount,
    weightFeeCount,
  };
}

export async function syncEcotrackCatalog(
  db: Database,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    now?: Date;
    trigger?: string;
    actor?: ActionActor | null;
  } = {},
): Promise<EcotrackSyncResult> {
  const startedAt = options.now ?? new Date();
  const trigger = options.trigger ?? 'manual';

  try {
    const snapshot = await fetchEcotrackCatalogSnapshot({
      fetchImpl: options.fetchImpl,
      env: options.env,
    });
    assertCompleteEcotrackCatalogSnapshot(snapshot);
    const finishedAt = new Date();

    await db.transaction(async (tx) => {
      const beforeCounts = await readCatalogCounts(tx);
      const [previousSuccessfulRun] = await tx
        .select()
        .from(ecotrackSyncRuns)
        .where(eq(ecotrackSyncRuns.status, 'success'))
        .orderBy(desc(ecotrackSyncRuns.finishedAt), desc(ecotrackSyncRuns.id))
        .limit(1);

      await tx.delete(ecotrackWeightFees);
      await tx.delete(ecotrackServiceFees);
      await tx.delete(ecotrackCommunes);
      await tx.delete(ecotrackWilayas);

      if (snapshot.wilayas.length > 0) {
        await tx.insert(ecotrackWilayas).values(
          snapshot.wilayas.map((entry) => ({
            wilayaId: entry.wilayaId,
            name: entry.name,
            createdAt: finishedAt,
            updatedAt: finishedAt,
          })),
        );
      }

      if (snapshot.communes.length > 0) {
        await tx.insert(ecotrackCommunes).values(
          snapshot.communes.map((entry) => ({
            communeId: entry.communeId,
            wilayaId: entry.wilayaId,
            name: entry.name,
            postalCode: entry.postalCode,
            hasStopDesk: entry.hasStopDesk,
            createdAt: finishedAt,
            updatedAt: finishedAt,
          })),
        );
      }

      if (snapshot.serviceFees.length > 0) {
        await tx.insert(ecotrackServiceFees).values(
          snapshot.serviceFees.map((entry) => ({
            serviceType: entry.serviceType,
            wilayaId: entry.wilayaId,
            homeFee: entry.homeFee,
            stopDeskFee: entry.stopDeskFee,
            createdAt: finishedAt,
            updatedAt: finishedAt,
          })),
        );
      }

      if (snapshot.weightFees.length > 0) {
        await tx.insert(ecotrackWeightFees).values(
          snapshot.weightFees.map((entry) => ({
            serviceType: entry.serviceType,
            homeSurcharge: entry.homeSurcharge,
            stopDeskSurcharge: entry.stopDeskSurcharge,
            perAdditionalKg: entry.perAdditionalKg,
            startsAtKg: entry.startsAtKg,
            createdAt: finishedAt,
            updatedAt: finishedAt,
          })),
        );
      }

      const [syncRun] = await tx
        .insert(ecotrackSyncRuns)
        .values({
          trigger,
          status: 'success',
          requestCount: snapshot.rateLimits.length,
          wilayaCount: snapshot.wilayas.length,
          communeCount: snapshot.communes.length,
          serviceFeeCount: snapshot.serviceFees.length,
          weightFeeCount: snapshot.weightFees.length,
          rateLimitSnapshot: snapshot.rateLimits,
          startedAt,
          finishedAt,
          createdAt: finishedAt,
          updatedAt: finishedAt,
        })
        .returning();

      await recordExplicitActionLog(tx, {
        entityType: 'ecotrackCatalogSyncRuns',
        entityId: syncRun.id,
        operation: 'update',
        beforeState: {
          ...beforeCounts,
          previousSuccessfulFinishedAt: previousSuccessfulRun?.finishedAt ?? null,
          previousSuccessfulStatus: previousSuccessfulRun?.status ?? null,
        },
        afterState: {
          wilayaCount: snapshot.wilayas.length,
          communeCount: snapshot.communes.length,
          serviceFeeCount: snapshot.serviceFees.length,
          weightFeeCount: snapshot.weightFees.length,
          trigger,
          status: 'success',
          requestCount: snapshot.rateLimits.length,
          startedAt,
          finishedAt,
          errorMessage: null,
          rateLimitSnapshot: snapshot.rateLimits,
          previousSuccessfulFinishedAt: previousSuccessfulRun?.finishedAt ?? null,
        },
        actor: resolveEcotrackActor(options.actor),
      });
    });

    return {
      trigger,
      syncedAt: finishedAt.toISOString(),
      requestCount: snapshot.rateLimits.length,
      wilayaCount: snapshot.wilayas.length,
      communeCount: snapshot.communes.length,
      serviceFeeCount: snapshot.serviceFees.length,
      weightFeeCount: snapshot.weightFees.length,
      rateLimits: snapshot.rateLimits,
    };
  } catch (error) {
    const finishedAt = new Date();
    const errorMessage = error instanceof Error ? error.message : 'Unknown ECOTRACK sync failure';

    await db.transaction(async (tx) => {
      const beforeCounts = await readCatalogCounts(tx);
      const [previousSuccessfulRun] = await tx
        .select()
        .from(ecotrackSyncRuns)
        .where(eq(ecotrackSyncRuns.status, 'success'))
        .orderBy(desc(ecotrackSyncRuns.finishedAt), desc(ecotrackSyncRuns.id))
        .limit(1);

      const [syncRun] = await tx
        .insert(ecotrackSyncRuns)
        .values({
          trigger,
          status: 'failed',
          requestCount: 0,
          wilayaCount: 0,
          communeCount: 0,
          serviceFeeCount: 0,
          weightFeeCount: 0,
          errorMessage,
          startedAt,
          finishedAt,
          createdAt: finishedAt,
          updatedAt: finishedAt,
        })
        .returning();

      await recordExplicitActionLog(tx, {
        entityType: 'ecotrackCatalogSyncRuns',
        entityId: syncRun.id,
        operation: 'update',
        beforeState: {
          ...beforeCounts,
          previousSuccessfulFinishedAt: previousSuccessfulRun?.finishedAt ?? null,
          previousSuccessfulStatus: previousSuccessfulRun?.status ?? null,
        },
        afterState: {
          ...beforeCounts,
          trigger,
          status: 'failed',
          requestCount: 0,
          startedAt,
          finishedAt,
          errorMessage,
          rateLimitSnapshot: null,
          previousSuccessfulFinishedAt: previousSuccessfulRun?.finishedAt ?? null,
        },
        actor: resolveEcotrackActor(options.actor),
      });
    });

    throw error;
  }
}
