import { count, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '@bric/db/client';
import type { EcotrackRateLimitSnapshot } from '@bric/storefront-core/ecotrack-client';
import {
  readEcotrackCatalog,
  type EcotrackCatalogRecord,
} from '@bric/storefront-core/ecotrack-support';
import {
  ecotrackCommunes,
  ecotrackServiceFees,
  ecotrackSyncRuns,
  ecotrackWeightFees,
  ecotrackWilayas,
} from '@bric/db/schema';
import { recordExplicitActionLog, type ActionActor } from './action-history';
import { requestEcotrackJson } from './ecotrack-provider';
import { parseNumericAmount, type DeliveryType } from './orders';

export function resolveEcotrackCommune(
  catalog: EcotrackCatalogRecord,
  state: number | null,
  city: string | null,
) {
  if (state === null) {
    return null;
  }

  const rawCity = city?.trim() ?? '';
  if (!rawCity) {
    return null;
  }

  return catalog.communes.find(
    (entry) =>
      entry.wilayaId === state &&
      (String(entry.communeId) === rawCity || entry.name.toLowerCase() === rawCity.toLowerCase()),
  );
}

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

const ecotrackWilayaSchema = z.object({
  wilaya_id: z.coerce.number().int().positive(),
  wilaya_name: z.string().trim().min(1),
});

const ecotrackCommuneSchema = z.object({
  nom: z.string().trim().min(1),
  wilaya_id: z.coerce.number().int().positive(),
  code_postal: z.string().trim().min(1).nullable().optional(),
  has_stop_desk: z.union([z.number(), z.string(), z.boolean()]).transform((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    return value === '1' || value.toLowerCase() === 'true';
  }),
});

const ecotrackServiceFeeSchema = z.object({
  wilaya_id: z.coerce.number().int().positive(),
  tarif: z.string().trim().min(1),
  tarif_stopdesk: z.string().trim().min(1),
});

const ecotrackWeightFeeSchema = z.object({
  surfacturation_a_domicile_DA: z.string().trim().min(1),
  surfacturation_stopdesk_DA: z.string().trim().min(1),
  pour_chaque_KG: z.string().trim().min(1),
  a_partir_de_KG: z.string().trim().min(1),
});

const ecotrackFeesSchema = z.object({
  livraison: z.array(ecotrackServiceFeeSchema),
  pickup: z.array(ecotrackServiceFeeSchema),
  echange: z.array(ecotrackServiceFeeSchema),
  recouvrement: z.array(ecotrackServiceFeeSchema),
  retours: z.array(ecotrackServiceFeeSchema),
  poids: z.object({
    livraison: ecotrackWeightFeeSchema,
    pickup: ecotrackWeightFeeSchema,
    echange: ecotrackWeightFeeSchema,
    recouvrement: ecotrackWeightFeeSchema,
  }),
});

const ecotrackServiceTypes = ['livraison', 'pickup', 'echange', 'recouvrement', 'retours'] as const;
const ecotrackWeightServiceTypes = ['livraison', 'pickup', 'echange', 'recouvrement'] as const;
const ecotrackMissingWilayaNames = new Map<number, string>([
  // The live /wilayas response omits IDs 50 and 54, while /communes still
  // references them. Name those IDs from their returned communes rather than
  // assuming the official 58-wilaya numbering (EcoTrack uses a different ID
  // sequence for the ten newer wilayas).
  [50, 'Bordj Badji Mokhtar'],
  [54, 'In Guezzam'],
]);
export type EcotrackServiceType = (typeof ecotrackServiceTypes)[number];
type EcotrackWeightServiceType = (typeof ecotrackWeightServiceTypes)[number];

export type EcotrackCatalogSnapshot = {
  wilayas: Array<{
    wilayaId: number;
    name: string;
  }>;
  communes: Array<{
    communeId: number;
    wilayaId: number;
    name: string;
    postalCode: string | null;
    hasStopDesk: boolean;
  }>;
  serviceFees: Array<{
    serviceType: EcotrackServiceType;
    wilayaId: number;
    homeFee: string;
    stopDeskFee: string;
  }>;
  weightFees: Array<{
    serviceType: EcotrackWeightServiceType;
    homeSurcharge: string;
    stopDeskSurcharge: string;
    perAdditionalKg: string;
    startsAtKg: string;
  }>;
  rateLimits: EcotrackRateLimitSnapshot[];
};

export type { EcotrackCatalogRecord };

export type EcotrackSyncResult = {
  trigger: string;
  syncedAt: string;
  requestCount: number;
  wilayaCount: number;
  communeCount: number;
  serviceFeeCount: number;
  weightFeeCount: number;
  rateLimits: EcotrackRateLimitSnapshot[];
};

export type EcotrackFeeLookup = Pick<EcotrackCatalogRecord, 'serviceFees'>;

class EcotrackCatalogSnapshotIncompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EcotrackCatalogSnapshotIncompleteError';
  }
}

function assertCompleteEcotrackCatalogSnapshot(snapshot: EcotrackCatalogSnapshot) {
  if (snapshot.wilayas.length === 0 || snapshot.communes.length === 0) {
    throw new EcotrackCatalogSnapshotIncompleteError(
      'ECOTRACK returned an empty location catalog; the previous catalog was preserved.',
    );
  }

  const deliveryFeeWilayas = new Set(
    snapshot.serviceFees
      .filter((fee) => fee.serviceType === 'livraison')
      .map((fee) => fee.wilayaId),
  );
  const missingFeeWilayas = snapshot.wilayas.filter(
    (wilaya) => !deliveryFeeWilayas.has(wilaya.wilayaId),
  );
  if (missingFeeWilayas.length > 0) {
    throw new EcotrackCatalogSnapshotIncompleteError(
      `ECOTRACK omitted delivery fees for ${missingFeeWilayas.length} wilaya(s); the previous catalog was preserved.`,
    );
  }
}
export async function fetchEcotrackCatalogSnapshot(
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<EcotrackCatalogSnapshot> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;

  const [wilayasResponse, communesResponse, feesResponse] = await Promise.all([
    requestEcotrackJson('/get/wilayas', z.array(ecotrackWilayaSchema), fetchImpl, env),
    requestEcotrackJson(
      '/get/communes',
      z.record(z.string(), ecotrackCommuneSchema),
      fetchImpl,
      env,
    ),
    requestEcotrackJson('/get/fees', ecotrackFeesSchema, fetchImpl, env),
  ]);

  const wilayas = wilayasResponse.data
    .map((entry) => ({
      wilayaId: entry.wilaya_id,
      name: entry.wilaya_name,
    }))
    .sort((left, right) => left.wilayaId - right.wilayaId);

  const communes = Object.entries(communesResponse.data)
    .map(([communeId, entry]) => ({
      communeId: Number.parseInt(communeId, 10),
      wilayaId: entry.wilaya_id,
      name: entry.nom,
      postalCode: entry.code_postal ?? null,
      hasStopDesk: entry.has_stop_desk,
    }))
    .filter((entry) => Number.isFinite(entry.communeId))
    .sort((left, right) => left.communeId - right.communeId);

  const serviceFees = ecotrackServiceTypes.flatMap((serviceType) =>
    feesResponse.data[serviceType].map((entry) => ({
      serviceType,
      wilayaId: entry.wilaya_id,
      homeFee: entry.tarif,
      stopDeskFee: entry.tarif_stopdesk,
    })),
  );

  const weightFees = ecotrackWeightServiceTypes.map((serviceType) => {
    const entry = feesResponse.data.poids[serviceType];

    return {
      serviceType,
      homeSurcharge: entry.surfacturation_a_domicile_DA,
      stopDeskSurcharge: entry.surfacturation_stopdesk_DA,
      perAdditionalKg: entry.pour_chaque_KG,
      startsAtKg: entry.a_partir_de_KG,
    };
  });

  const knownWilayaIds = new Set(wilayas.map((entry) => entry.wilayaId));
  const missingWilayaIds = [
    ...new Set([
      ...communes
        .filter((entry) => !knownWilayaIds.has(entry.wilayaId))
        .map((entry) => entry.wilayaId),
      ...serviceFees
        .filter((entry) => !knownWilayaIds.has(entry.wilayaId))
        .map((entry) => entry.wilayaId),
    ]),
  ].sort((left, right) => left - right);

  for (const wilayaId of missingWilayaIds) {
    wilayas.push({
      wilayaId,
      name: ecotrackMissingWilayaNames.get(wilayaId) ?? `Wilaya ${wilayaId}`,
    });
  }

  wilayas.sort((left, right) => left.wilayaId - right.wilayaId);

  return {
    wilayas,
    communes,
    serviceFees,
    weightFees,
    rateLimits: [wilayasResponse.rateLimit, communesResponse.rateLimit, feesResponse.rateLimit],
  };
}

export { readEcotrackCatalog };

export function resolveEcotrackDeliveryFee(
  catalog: EcotrackFeeLookup,
  wilayaId: number | null | undefined,
  deliveryType: DeliveryType,
  serviceType: EcotrackServiceType = 'livraison',
) {
  if (!wilayaId) {
    return 0;
  }

  const serviceFee = catalog.serviceFees.find(
    (entry) => entry.serviceType === serviceType && entry.wilayaId === wilayaId,
  );

  if (!serviceFee) {
    return 0;
  }

  return deliveryType === 0
    ? parseNumericAmount(serviceFee.homeFee)
    : parseNumericAmount(serviceFee.stopDeskFee);
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
