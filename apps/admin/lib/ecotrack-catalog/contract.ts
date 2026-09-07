import type { getDb } from '@bric/db/client';
import type { EcotrackRateLimitSnapshot } from '@bric/storefront-core/ecotrack-client';
import { type EcotrackCatalogRecord } from '@bric/storefront-core/ecotrack-support';
import { z } from 'zod';

export type Database = ReturnType<typeof getDb>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';

export const ecotrackWilayaSchema = z.object({
  wilaya_id: z.coerce.number().int().positive(),
  wilaya_name: z.string().trim().min(1),
});

export const ecotrackCommuneSchema = z.object({
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

export const ecotrackFeesSchema = z.object({
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

export const ecotrackServiceTypes = [
  'livraison',
  'pickup',
  'echange',
  'recouvrement',
  'retours',
] as const;

export const ecotrackWeightServiceTypes = [
  'livraison',
  'pickup',
  'echange',
  'recouvrement',
] as const;

export const ecotrackMissingWilayaNames = new Map<number, string>([
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

export function assertCompleteEcotrackCatalogSnapshot(snapshot: EcotrackCatalogSnapshot) {
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
