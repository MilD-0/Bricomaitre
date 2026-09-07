import { z } from 'zod';
import { requestEcotrackJson } from '../ecotrack-provider';
import {
  ecotrackCommuneSchema,
  ecotrackFeesSchema,
  ecotrackMissingWilayaNames,
  ecotrackServiceTypes,
  ecotrackWeightServiceTypes,
  ecotrackWilayaSchema,
  type EcotrackCatalogSnapshot,
} from './contract';

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
