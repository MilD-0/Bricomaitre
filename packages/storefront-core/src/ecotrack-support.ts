import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '../../db/src/client';
import {
  ecotrackCommunes,
  ecotrackServiceFees,
  ecotrackSyncRuns,
  ecotrackWeightFees,
  ecotrackWilayas,
} from '../../db/src/schema';
import { parseNumericAmount, type DeliveryType } from './orders-support';

type Database = ReturnType<typeof getDb>;

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
  [50, 'In Salah'],
  [54, 'In Guezzam'],
]);

export type EcotrackServiceType = (typeof ecotrackServiceTypes)[number];
export type EcotrackWeightServiceType = (typeof ecotrackWeightServiceTypes)[number];

export type EcotrackRateLimitSnapshot = {
  path: string;
  limit: number | null;
  remaining: number | null;
  reset: number | null;
};

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

export type EcotrackCatalogRecord = {
  wilayas: typeof ecotrackWilayas.$inferSelect[];
  communes: typeof ecotrackCommunes.$inferSelect[];
  serviceFees: typeof ecotrackServiceFees.$inferSelect[];
  weightFees: typeof ecotrackWeightFees.$inferSelect[];
  lastSync: typeof ecotrackSyncRuns.$inferSelect | null;
};

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

export function cleanEcotrackEnvValue(value: string | undefined | null) {
  return String(value ?? '')
    .trim()
    .replace(/^['"\s]+/, '')
    .replace(/['",\s]+$/, '');
}

export function getEcotrackConfig(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = cleanEcotrackEnvValue(env.ECOTRACK_BASE_URL).replace(/\/$/, '');
  const token = cleanEcotrackEnvValue(env.ECOTRACK_TOKEN);

  if (!baseUrl) {
    throw new Error('ECOTRACK_BASE_URL is not configured.');
  }

  if (!token) {
    throw new Error('ECOTRACK_TOKEN is not configured.');
  }

  return { baseUrl, token };
}

function parseRateLimit(headers: Headers, path: string): EcotrackRateLimitSnapshot {
  const readNumber = (headerName: string) => {
    const value = headers.get(headerName);
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return {
    path,
    limit: readNumber('x-ratelimit-limit-minute') ?? readNumber('x-ratelimit-limit'),
    remaining: readNumber('x-ratelimit-remaining-minute') ?? readNumber('x-ratelimit-remaining'),
    reset: readNumber('x-ratelimit-reset-minute') ?? readNumber('x-ratelimit-reset'),
  };
}

async function requestEcotrackJson<T>(
  path: string,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
  env: NodeJS.ProcessEnv,
) {
  const { baseUrl, token } = getEcotrackConfig(env);
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('api_token', token);

  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`ECOTRACK request failed for ${path}: ${response.status} ${text.slice(0, 200)}`);
  }

  let payload: unknown;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`ECOTRACK request returned invalid JSON for ${path}.`);
  }

  return {
    data: schema.parse(payload),
    rateLimit: parseRateLimit(response.headers, path),
  };
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
    requestEcotrackJson('/get/communes', z.record(z.string(), ecotrackCommuneSchema), fetchImpl, env),
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
  const missingWilayaIds = [...new Set([
    ...communes.filter((entry) => !knownWilayaIds.has(entry.wilayaId)).map((entry) => entry.wilayaId),
    ...serviceFees.filter((entry) => !knownWilayaIds.has(entry.wilayaId)).map((entry) => entry.wilayaId),
  ])].sort((left, right) => left - right);

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

export async function readEcotrackCatalog(db: Database): Promise<EcotrackCatalogRecord> {
  const [wilayas, communes, serviceFees, weightFees, lastSync] = await Promise.all([
    db.select().from(ecotrackWilayas).orderBy(asc(ecotrackWilayas.wilayaId)),
    db.select().from(ecotrackCommunes).orderBy(asc(ecotrackCommunes.wilayaId), asc(ecotrackCommunes.name)),
    db.select().from(ecotrackServiceFees).orderBy(asc(ecotrackServiceFees.serviceType), asc(ecotrackServiceFees.wilayaId)),
    db.select().from(ecotrackWeightFees).orderBy(asc(ecotrackWeightFees.serviceType)),
    db.select().from(ecotrackSyncRuns).orderBy(desc(ecotrackSyncRuns.startedAt)).limit(1).then((rows) => rows[0] ?? null),
  ]);

  return {
    wilayas,
    communes,
    serviceFees,
    weightFees,
    lastSync,
  };
}

export async function readEcotrackDeliveryFee(
  db: Database,
  wilayaId: number | null | undefined,
  deliveryType: DeliveryType,
  serviceType: EcotrackServiceType = 'livraison',
) {
  if (!wilayaId) {
    return 0;
  }

  const [serviceFee] = await db
    .select({
      homeFee: ecotrackServiceFees.homeFee,
      stopDeskFee: ecotrackServiceFees.stopDeskFee,
    })
    .from(ecotrackServiceFees)
    .where(and(
      eq(ecotrackServiceFees.serviceType, serviceType),
      eq(ecotrackServiceFees.wilayaId, wilayaId),
    ))
    .limit(1);

  if (!serviceFee) {
    return 0;
  }

  return deliveryType === 0
    ? parseNumericAmount(serviceFee.homeFee)
    : parseNumericAmount(serviceFee.stopDeskFee);
}

export function resolveEcotrackDeliveryFee(
  catalog: EcotrackFeeLookup,
  wilayaId: number | null | undefined,
  deliveryType: DeliveryType,
  serviceType: EcotrackServiceType = 'livraison',
) {
  if (!wilayaId) {
    return 0;
  }

  const serviceFee = catalog.serviceFees.find((entry) => entry.serviceType === serviceType && entry.wilayaId === wilayaId);

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
  } = {},
): Promise<EcotrackSyncResult> {
  const startedAt = options.now ?? new Date();
  const trigger = options.trigger ?? 'manual';

  try {
    const snapshot = await fetchEcotrackCatalogSnapshot({
      fetchImpl: options.fetchImpl,
      env: options.env,
    });
    const finishedAt = new Date();

    await db.transaction(async (tx) => {
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

      await tx.insert(ecotrackSyncRuns).values({
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

    await db.insert(ecotrackSyncRuns).values({
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
    });

    throw error;
  }
}
