import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '../db/client';
import {
  ecotrackCommunes,
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  ecotrackServiceFees,
  ecotrackSyncRuns,
  ecotrackWeightFees,
  ecotrackWilayas,
  orders,
  orderStatusHistory,
} from '../db/schema';
import { recordExplicitActionLog, type ActionActor } from './action-history';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import { coerceOrderStatus, parseNumericAmount, type DeliveryType, type OrderRecord, type OrderStatusHistoryRecord } from './orders';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';
const ORDER_STATUS_POSTED = 11;

export const ecotrackProviders = ['delivro', 'emir'] as const;
export type EcotrackProvider = (typeof ecotrackProviders)[number];

export function getEcotrackProviderEnv(provider: EcotrackProvider, env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  if (provider === 'delivro') {
    return env;
  }

  return {
    ...env,
    ECOTRACK_BASE_URL: env.ECOTRACK_EMIR_BASE_URL,
    ECOTRACK_TOKEN: env.ECOTRACK_EMIR_TOKEN,
  };
}

function serializeActionValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeActionValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, serializeActionValue(entry)]),
    );
  }
  return value;
}

function areActionSnapshotsEqual(left: unknown, right: unknown) {
  return JSON.stringify(serializeActionValue(left)) === JSON.stringify(serializeActionValue(right));
}

function resolveEcotrackActor(actor?: ActionActor | null): ActionActor {
  if (actor?.email || actor?.name) {
    return actor;
  }

  return {
    email: null,
    name: ECOTRACK_SYNC_ACTOR_NAME,
  };
}

function buildOrderActionSnapshot(row: typeof orders.$inferSelect) {
  return {
    id: row.id,
    confirmed: row.confirmed,
    noAnswerCount: row.noAnswerCount,
    confirmedBy: row.confirmedBy,
    confirmedByName: row.confirmedByName,
    confirmedAt: row.confirmedAt,
    ecotrackStatus: row.ecotrackStatus,
    ecotrackStatusLastUpdate: row.ecotrackStatusLastUpdate,
    ecotrackStatusData: row.ecotrackStatusData,
    ecotrackReference: row.ecotrackReference,
    ecotrackTrackingNumber: row.ecotrackTrackingNumber,
    updatedAt: row.updatedAt,
  };
}

function buildShipmentActionSnapshot(row: typeof ecotrackOrderStates.$inferSelect) {
  return {
    id: row.id,
    orderId: row.orderId,
    reference: row.reference,
    trackingNumber: row.trackingNumber,
    currentStatus: row.currentStatus,
    driverPhone: row.driverPhone,
    estimatedFee: row.estimatedFee,
    deskPhone: row.deskPhone,
    deskCommune: row.deskCommune,
    deskMapLink: row.deskMapLink,
    deskAddress: row.deskAddress,
    rawStatusPayload: row.rawStatusPayload,
    rawCreatePayload: row.rawCreatePayload,
    rawLastTrackingPayload: row.rawLastTrackingPayload,
    rawLastMajPayload: row.rawLastMajPayload,
    lastStatusSyncedAt: row.lastStatusSyncedAt,
    lastTrackingSyncedAt: row.lastTrackingSyncedAt,
    lastMajSyncedAt: row.lastMajSyncedAt,
    lastActionAt: row.lastActionAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function recordEcotrackOrderAction(
  tx: Transaction,
  beforeState: ReturnType<typeof buildOrderActionSnapshot>,
  afterState: ReturnType<typeof buildOrderActionSnapshot>,
  actor?: ActionActor | null,
) {
  if (areActionSnapshotsEqual(beforeState, afterState)) {
    return;
  }

  await recordExplicitActionLog(tx, {
    entityType: 'orders',
    entityId: beforeState.id,
    operation: 'update',
    beforeState,
    afterState,
    actor: resolveEcotrackActor(actor),
    isReversible: false,
  });
}

async function recordEcotrackShipmentAction(
  tx: Transaction,
  orderId: number,
  beforeState: ReturnType<typeof buildShipmentActionSnapshot> | null,
  afterState: ReturnType<typeof buildShipmentActionSnapshot> | null,
  actor?: ActionActor | null,
  operation?: 'create' | 'update' | 'delete',
) {
  if (operation === 'update' && beforeState && afterState && areActionSnapshotsEqual(beforeState, afterState)) {
    return;
  }

  const nextOperation = operation ?? (beforeState ? (afterState ? 'update' : 'delete') : 'create');

  await recordExplicitActionLog(tx, {
    entityType: 'ecotrackShipments',
    entityId: orderId,
    operation: nextOperation,
    beforeState,
    afterState,
    actor: resolveEcotrackActor(actor),
  });
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
  [50, 'In Salah'],
  [54, 'In Guezzam'],
]);
const ECOTRACK_PLACEHOLDER_ADDRESS = 'Adresse non renseignee';

export type EcotrackServiceType = (typeof ecotrackServiceTypes)[number];
export type EcotrackWeightServiceType = (typeof ecotrackWeightServiceTypes)[number];

export type EcotrackRateLimitSnapshot = {
  path: string;
  limit: number | null;
  remaining: number | null;
  reset: number | null;
};

export type EcotrackExtendedRateLimitSnapshot = EcotrackRateLimitSnapshot & {
  minuteLimit: number | null;
  minuteRemaining: number | null;
  minuteReset: number | null;
  hourLimit: number | null;
  hourRemaining: number | null;
  hourReset: number | null;
  dayLimit: number | null;
  dayRemaining: number | null;
  dayReset: number | null;
  retryAfterSeconds: number | null;
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
export type EcotrackPreviewReason =
  | 'already_posted'
  | 'status_not_confirmed'
  | 'missing_name'
  | 'missing_phone'
  | 'missing_wilaya'
  | 'missing_commune'
  | 'invalid_commune'
  | 'missing_address';

export type EcotrackOrderPayload = {
  reference: string;
  nom_client: string;
  telephone: string;
  telephone_2?: string;
  adresse: string;
  code_postal?: string;
  commune: string;
  code_wilaya: string;
  montant: string;
  remarque?: string;
  produit?: string;
  type: '1';
  stop_desk: 0 | 1;
};

export type EcotrackOrderPreviewItem = {
  orderId: number;
  customerName: string;
  destination: string;
  amount: string;
  payload: EcotrackOrderPayload;
};

export type EcotrackOrderSkipItem = {
  orderId: number;
  customerName: string;
  reason: 'already_posted';
};

export type EcotrackOrderInvalidItem = {
  orderId: number;
  customerName: string;
  reason: Exclude<EcotrackPreviewReason, 'already_posted'>;
  message: string;
};

export type EcotrackCreateOrderResult = {
  success: boolean;
  tracking: string | null;
  message: string | null;
  raw: unknown;
};

export type EcotrackPostingResultItem = {
  orderId: number;
  reference: string;
  tracking: string | null;
  status: 'skipped' | 'invalid' | 'created' | 'failed';
  message: string;
};

export type EcotrackPostingSummary = {
  totalRequested: number;
  eligible: number;
  created: number;
  skippedAlreadyPosted: number;
  invalid: number;
  failed: number;
  rateLimits: EcotrackExtendedRateLimitSnapshot[];
  results: EcotrackPostingResultItem[];
};

export type EcotrackOrderInput = {
  row: typeof orders.$inferSelect;
  record: OrderRecord;
};

type EcotrackPreviewResult = {
  totalRequested: number;
  eligible: EcotrackOrderPreviewItem[];
  skipped: EcotrackOrderSkipItem[];
  invalid: EcotrackOrderInvalidItem[];
};

type EcotrackRequestResult = {
  payload: unknown;
  text: string;
  rateLimit: EcotrackExtendedRateLimitSnapshot;
};

type EcotrackRequestOptions = {
  path: string;
  method?: 'GET' | 'POST';
  query?: Record<string, string | number | null | undefined>;
  json?: unknown;
  fetchImpl: typeof fetch;
  env: NodeJS.ProcessEnv;
};

export class EcotrackRateLimitError extends Error {
  status: number;
  rateLimit: EcotrackExtendedRateLimitSnapshot;

  constructor(message: string, rateLimit: EcotrackExtendedRateLimitSnapshot, status = 429) {
    super(message);
    this.name = 'EcotrackRateLimitError';
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

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

function parseRateLimit(headers: Headers, path: string): EcotrackExtendedRateLimitSnapshot {
  const readNumber = (headerName: string) => {
    const value = headers.get(headerName);
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const minuteLimit = readNumber('x-ratelimit-limit')
    ?? readNumber('x-ratelimit-limit-minute');
  const minuteRemaining = readNumber('x-ratelimit-remaining')
    ?? readNumber('x-ratelimit-remaining-minute')
    ?? readNumber('x-ratelimit-limit-remaining');
  const minuteReset = readNumber('x-ratelimit-reset')
    ?? readNumber('x-ratelimit-reset-minute');

  return {
    path,
    limit: minuteLimit,
    remaining: minuteRemaining,
    reset: minuteReset,
    minuteLimit,
    minuteRemaining,
    minuteReset,
    hourLimit: readNumber('x-ratelimit-limit-hour'),
    hourRemaining: readNumber('x-ratelimit-remaining-hour'),
    hourReset: readNumber('x-ratelimit-reset-hour'),
    dayLimit: readNumber('x-ratelimit-limit-day'),
    dayRemaining: readNumber('x-ratelimit-remaining-day'),
    dayReset: readNumber('x-ratelimit-reset-day'),
    retryAfterSeconds: readNumber('retry-after'),
  };
}

function normalizeEcotrackText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEcotrackPhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 9) return `0${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return digits;
  return digits;
}

function readEcotrackSuccess(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const value = (payload as Record<string, unknown>).success;
  return value === true || value === 1 || value === '1';
}

function readEcotrackMessage(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>).message;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readEcotrackErrors(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }

  const value = (payload as Record<string, unknown>).errors;
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => typeof entry === 'string' ? entry.trim() : '')
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
      .map((entry) => typeof entry === 'string' ? entry.trim() : '')
      .filter(Boolean);
  }

  return [];
}

function readEcotrackTracking(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>).tracking;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function buildEcotrackResultMessage(payload: unknown, fallback: string) {
  const explicitMessage = readEcotrackMessage(payload);
  if (explicitMessage) {
    return explicitMessage;
  }

  const errors = readEcotrackErrors(payload);
  if (errors.length > 0) {
    return errors.join('; ');
  }

  if (typeof payload === 'string') {
    const text = payload.trim();
    if (text) {
      return text;
    }
  }

  return fallback;
}

async function applyEcotrackRateLimitBackoff(rateLimit: EcotrackExtendedRateLimitSnapshot) {
  if (rateLimit.dayRemaining !== null && rateLimit.dayRemaining <= 0) {
    throw new EcotrackRateLimitError('ECOTRACK daily rate limit exhausted.', rateLimit);
  }

  if (rateLimit.hourRemaining !== null && rateLimit.hourRemaining <= 0) {
    throw new EcotrackRateLimitError('ECOTRACK hourly rate limit exhausted.', rateLimit);
  }

  if (rateLimit.retryAfterSeconds !== null && rateLimit.retryAfterSeconds > 0) {
    await sleep(rateLimit.retryAfterSeconds * 1000);
    return;
  }

  if (rateLimit.minuteRemaining !== null && rateLimit.minuteRemaining <= 1 && rateLimit.minuteReset !== null) {
    const waitMs = Math.max((rateLimit.minuteReset * 1000) - Date.now(), 0);
    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}

async function requestEcotrack(
  options: EcotrackRequestOptions,
): Promise<EcotrackRequestResult> {
  const { baseUrl, token } = getEcotrackConfig(options.env);
  const url = new URL(`${baseUrl}${options.path}`);
  url.searchParams.set('api_token', token);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: HeadersInit = {
    Accept: 'application/json, text/plain;q=0.9',
  };
  let body: string | undefined;

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  const response = await options.fetchImpl(url, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  const text = await response.text();
  const rateLimit = parseRateLimit(response.headers, options.path);

  if (response.status === 429) {
    throw new EcotrackRateLimitError(`ECOTRACK rate limit exceeded for ${options.path}.`, rateLimit, 429);
  }

  let payload: unknown = text;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    throw new Error(`ECOTRACK request failed for ${options.path}: ${response.status} ${text.slice(0, 200)}`);
  }

  await applyEcotrackRateLimitBackoff(rateLimit);

  return { payload, text, rateLimit };
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

function buildOrderHistory(rows: typeof orderStatusHistory.$inferSelect[]): OrderStatusHistoryRecord[] {
  return rows.map((entry) => ({
    id: entry.id,
    status: coerceOrderStatus(entry.status),
    noAnswerCount: entry.noAnswerCount,
    changedAt: entry.changedAt.toISOString(),
    changedBy: entry.changedBy,
    changedByName: entry.changedByName,
  }));
}

export async function loadEcotrackOrderInputs(
  db: Database,
  mode: 'selected' | 'confirmed',
  orderIds: number[],
): Promise<EcotrackOrderInput[]> {
  if (orderIds.length === 0) {
    return [];
  }

  const orderRows = await db.query.orders.findMany({
    where: mode === 'confirmed'
      ? and(eq(orders.confirmed, 2), isNull(orders.archivedAt), inArray(orders.id, orderIds))
      : and(isNull(orders.archivedAt), inArray(orders.id, orderIds)),
    orderBy: [asc(orders.id)],
  });

  const historyRows = await db.query.orderStatusHistory.findMany({
    where: inArray(orderStatusHistory.orderId, orderRows.map((row) => row.id)),
    orderBy: [asc(orderStatusHistory.changedAt)],
  });

  const historyByOrderId = new Map<number, OrderStatusHistoryRecord[]>();
  for (const row of historyRows) {
    const list = historyByOrderId.get(row.orderId) ?? [];
    list.push({
      id: row.id,
      status: coerceOrderStatus(row.status),
      noAnswerCount: row.noAnswerCount,
      changedAt: row.changedAt.toISOString(),
      changedBy: row.changedBy,
      changedByName: row.changedByName,
    });
    historyByOrderId.set(row.orderId, list);
  }

  const productLookup = await getOrderProductLookup(db, orderRows);
  return orderRows.map((row) => ({
    row,
    record: toOrderRecord(row, historyByOrderId.get(row.id) ?? [], productLookup),
  }));
}

export async function validateEcotrackToken(
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/validate/token',
    method: 'GET',
    fetchImpl: options.fetchImpl ?? fetch,
    env: options.env ?? process.env,
  });

  return {
    success: readEcotrackSuccess(result.payload),
    message: readEcotrackMessage(result.payload),
    rateLimit: result.rateLimit,
    raw: result.payload,
  };
}

function resolveEcotrackCommune(
  catalog: EcotrackCatalogRecord,
  state: number | null,
  city: string | null,
) {
  if (state === null) {
    return null;
  }

  const rawCity = normalizeEcotrackText(city);
  if (!rawCity) {
    return null;
  }

  return catalog.communes.find((entry) =>
    entry.wilayaId === state
      && (String(entry.communeId) === rawCity || entry.name.toLowerCase() === rawCity.toLowerCase()));
}

export function buildEcotrackOrderPayload(order: OrderRecord, catalog: EcotrackCatalogRecord): EcotrackOrderPayload {
  const commune = resolveEcotrackCommune(catalog, order.state, order.city);
  const normalizedAddress = normalizeEcotrackText(order.homeAddress);
  const payload: EcotrackOrderPayload = {
    reference: String(order.id),
    nom_client: normalizeEcotrackText(order.fullName),
    telephone: normalizeEcotrackPhone(order.phoneNumber1),
    adresse: normalizedAddress || ECOTRACK_PLACEHOLDER_ADDRESS,
    commune: commune?.name ?? normalizeEcotrackText(order.city),
    code_wilaya: order.state === null ? '' : String(order.state),
    montant: String(Math.round(order.totalAmount * 100) / 100),
    type: '1',
    stop_desk: order.delivery === 1 ? 1 : 0,
  };

  const secondaryPhone = normalizeEcotrackPhone(order.phoneNumber2);
  if (secondaryPhone) {
    payload.telephone_2 = secondaryPhone;
  }

  if (commune?.postalCode) {
    payload.code_postal = commune.postalCode;
  }

  const note = normalizeEcotrackText(order.note);
  if (note) {
    payload.remarque = note.slice(0, 255);
  }

  const product = order.orderProducts.map((item) => `${item.title} x${item.quantity}`).join(', ').trim();
  if (product) {
    payload.produit = product.slice(0, 255);
  }

  return payload;
}

export function classifyOrdersForEcotrackPosting(
  items: EcotrackOrderInput[],
  catalog: EcotrackCatalogRecord,
): EcotrackPreviewResult {
  const eligible: EcotrackOrderPreviewItem[] = [];
  const skipped: EcotrackOrderSkipItem[] = [];
  const invalid: EcotrackOrderInvalidItem[] = [];

  for (const item of items) {
    const { row, record } = item;
    const customerName = record.fullName;

    if (row.ecotrackReference || row.ecotrackTrackingNumber) {
      skipped.push({ orderId: row.id, customerName, reason: 'already_posted' });
      continue;
    }

    if (record.confirmed !== 2) {
      invalid.push({ orderId: row.id, customerName, reason: 'status_not_confirmed', message: 'Order must be confirmed before posting.' });
      continue;
    }

    if (!normalizeEcotrackText(record.fullName)) {
      invalid.push({ orderId: row.id, customerName, reason: 'missing_name', message: 'Customer name is required.' });
      continue;
    }

    if (!normalizeEcotrackPhone(record.phoneNumber1)) {
      invalid.push({ orderId: row.id, customerName, reason: 'missing_phone', message: 'Primary phone number is required.' });
      continue;
    }

    if (record.state === null) {
      invalid.push({ orderId: row.id, customerName, reason: 'missing_wilaya', message: 'Wilaya is required.' });
      continue;
    }

    if (!normalizeEcotrackText(record.city)) {
      invalid.push({ orderId: row.id, customerName, reason: 'missing_commune', message: 'Commune is required.' });
      continue;
    }

    const commune = resolveEcotrackCommune(catalog, record.state, record.city);
    if (!commune) {
      invalid.push({ orderId: row.id, customerName, reason: 'invalid_commune', message: 'Commune is not active or could not be resolved.' });
      continue;
    }

    if (record.delivery !== 1 && !normalizeEcotrackText(record.homeAddress)) {
      invalid.push({ orderId: row.id, customerName, reason: 'missing_address', message: 'Delivery address is required.' });
      continue;
    }

    const payload = buildEcotrackOrderPayload(record, catalog);
    eligible.push({
      orderId: row.id,
      customerName,
      destination: `${payload.commune}, ${payload.code_wilaya}`,
      amount: payload.montant,
      payload,
    });
  }

  return {
    totalRequested: items.length,
    eligible,
    skipped,
    invalid,
  };
}

export async function createEcotrackOrdersBatch(
  ordersBatch: EcotrackOrderPayload[],
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const keyedOrders = Object.fromEntries(ordersBatch.map((order, index) => [String(index), order]));
  const result = await requestEcotrack({
    path: '/create/orders',
    method: 'POST',
    json: { orders: keyedOrders },
    fetchImpl: options.fetchImpl ?? fetch,
    env: options.env ?? process.env,
  });

  const payloadObject = typeof result.payload === 'object' && result.payload !== null
    ? result.payload as Record<string, unknown>
    : {};
  const rawResults = typeof payloadObject.results === 'object' && payloadObject.results !== null
    ? payloadObject.results as Record<string, unknown>
    : {};
  const normalized = new Map<string, EcotrackCreateOrderResult>();

  for (const [index, order] of ordersBatch.entries()) {
    const raw = rawResults[order.reference] ?? rawResults[String(index)];
    normalized.set(order.reference, {
      success: readEcotrackSuccess(raw),
      tracking: readEcotrackTracking(raw),
      message: readEcotrackMessage(raw) ?? (readEcotrackSuccess(raw) ? null : buildEcotrackResultMessage(raw, 'Ecotrack rejected the order.')),
      raw,
    });
  }

  return {
    rateLimit: result.rateLimit,
    results: normalized,
    raw: result.payload,
  };
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
    const beforeOrderState = buildOrderActionSnapshot(input.row);
    const beforeShipmentState = existingShipment ? buildShipmentActionSnapshot(existingShipment) : null;

    await tx
      .update(orders)
      .set({
        confirmed: existingShipment ? input.row.confirmed : ORDER_STATUS_POSTED,
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
      })
      .where(eq(orders.id, input.row.id));

    if (!existingShipment) {
      await tx.insert(orderStatusHistory).values({
        orderId: input.row.id,
        status: ORDER_STATUS_POSTED,
        noAnswerCount: 0,
        changedBy: actor.email ?? null,
        changedByName: actor.name ?? null,
        changedAt: now,
      });
    }

    await tx.insert(ecotrackOrderStates).values({
      orderId: input.row.id,
      reference: String(input.row.id),
      trackingNumber: createResult.tracking ?? '',
      provider,
      currentStatus: 'prete_a_expedier',
      rawCreatePayload: createResult.raw,
      rawStatusPayload: {
        currentStatus: 'prete_a_expedier',
        createMessage: createResult.message ?? null,
      },
      lastActionAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: ecotrackOrderStates.orderId,
      set: {
        reference: String(input.row.id),
        trackingNumber: createResult.tracking ?? '',
        provider,
        currentStatus: 'prete_a_expedier',
        rawCreatePayload: createResult.raw,
        rawStatusPayload: {
          currentStatus: 'prete_a_expedier',
          createMessage: createResult.message ?? null,
        },
        deletedAt: null,
        lastActionAt: now,
        updatedAt: now,
      },
    });

    const afterOrderState = {
      ...beforeOrderState,
      confirmed: existingShipment ? input.row.confirmed : ORDER_STATUS_POSTED,
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
      rawCreatePayload: createResult.raw,
      rawStatusPayload: {
        currentStatus: 'prete_a_expedier',
        createMessage: createResult.message ?? null,
      },
      lastActionAt: now,
      deletedAt: null,
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

export async function buildEcotrackPostingPreview(
  db: Database,
  mode: 'selected' | 'confirmed',
  orderIds: number[],
  _provider: EcotrackProvider = 'delivro',
) {
  const items = await loadEcotrackOrderInputs(db, mode, orderIds);
  const catalog = await readEcotrackCatalog(db);
  return classifyOrdersForEcotrackPosting(items, catalog);
}

function createPostingSummary(preview: EcotrackPreviewResult): EcotrackPostingSummary {
  return {
    totalRequested: preview.totalRequested,
    eligible: preview.eligible.length,
    created: 0,
    skippedAlreadyPosted: preview.skipped.length,
    invalid: preview.invalid.length,
    failed: 0,
    rateLimits: [],
    results: [
      ...preview.skipped.map((item): EcotrackPostingResultItem => ({
        orderId: item.orderId,
        reference: String(item.orderId),
        tracking: null,
        status: 'skipped',
        message: item.reason,
      })),
      ...preview.invalid.map((item): EcotrackPostingResultItem => ({
        orderId: item.orderId,
        reference: String(item.orderId),
        tracking: null,
        status: 'invalid',
        message: item.message,
      })),
    ],
  };
}

type EcotrackPostingHooks = {
  throwIfCancelled?: () => Promise<void>;
  updateProgress?: (progress: { phase: string; current: number; total: number }) => Promise<void>;
  updateSummary?: (summary: EcotrackPostingSummary) => Promise<void>;
};

function withLatestRateLimit(summary: EcotrackPostingSummary, rateLimit: EcotrackExtendedRateLimitSnapshot) {
  summary.rateLimits = [...summary.rateLimits.filter((entry) => entry.path !== rateLimit.path), rateLimit];
}

async function flushPostingState(
  hooks: EcotrackPostingHooks,
  phase: string,
  current: number,
  total: number,
  summary: EcotrackPostingSummary,
) {
  await hooks.updateProgress?.({ phase, current, total });
  await hooks.updateSummary?.(summary);
}

export async function postOrdersToEcotrack(
  db: Database,
  items: EcotrackOrderInput[],
  catalog: EcotrackCatalogRecord,
  actor: { email?: string | null; name?: string | null },
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    batchSize?: number;
    mutatingDelayMs?: number;
    provider?: EcotrackProvider;
  } & EcotrackPostingHooks = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const provider = options.provider ?? 'delivro';
  const env = getEcotrackProviderEnv(provider, options.env ?? process.env);
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 100);
  const mutatingDelayMs = Math.max(options.mutatingDelayMs ?? Number(env.ECOTRACK_MUTATING_DELAY_MS ?? 250), 0);
  const preview = classifyOrdersForEcotrackPosting(items, catalog);
  const summary = createPostingSummary(preview);
  const inputById = new Map(items.map((item) => [item.row.id, item]));

  await flushPostingState(options, 'validating-token', 0, preview.eligible.length, summary);
  await options.throwIfCancelled?.();

  const tokenValidation = await validateEcotrackToken({ fetchImpl, env });
  withLatestRateLimit(summary, tokenValidation.rateLimit);
  await options.updateSummary?.(summary);

  if (!tokenValidation.success) {
    throw new Error(tokenValidation.message ?? 'ECOTRACK token validation failed.');
  }

  await flushPostingState(options, 'classifying', preview.eligible.length, preview.eligible.length, summary);

  const batches = chunkArray(preview.eligible, batchSize);
  let createdCount = 0;
  let processedCount = 0;

  for (const [batchIndex, batch] of batches.entries()) {
    await options.throwIfCancelled?.();
    await options.updateProgress?.({ phase: 'creating', current: processedCount, total: preview.eligible.length });

    const createResponse = await createEcotrackOrdersBatch(batch.map((item) => item.payload), { fetchImpl, env });
    withLatestRateLimit(summary, createResponse.rateLimit);
    await options.updateSummary?.(summary);

    for (const batchItem of batch) {
      await options.throwIfCancelled?.();
      const createResult = createResponse.results.get(batchItem.payload.reference) ?? {
        success: false,
        tracking: null,
        message: 'Ecotrack did not return a result for this order.',
        raw: null,
      };

      if (createResult.success && createResult.tracking) {
        createdCount += 1;
        summary.created = createdCount;
        summary.results.push({
          orderId: batchItem.orderId,
          reference: batchItem.payload.reference,
          tracking: createResult.tracking,
          status: 'created',
          message: createResult.message ?? 'Created successfully.',
        });

        await options.updateProgress?.({ phase: 'persisting', current: createdCount - 1, total: preview.eligible.length });
        const input = inputById.get(batchItem.orderId);
        if (!input) {
          throw new Error(`Missing order input for Ecotrack order ${batchItem.orderId}.`);
        }

        await persistEcotrackPostedOrder(db, input, actor, createResult, provider);
      } else {
        summary.failed += 1;
        summary.results.push({
          orderId: batchItem.orderId,
          reference: batchItem.payload.reference,
          tracking: createResult.tracking,
          status: 'failed',
          message: createResult.message ?? 'Ecotrack rejected the order.',
        });
      }

      processedCount += 1;
      await options.updateSummary?.(summary);
    }

    await options.updateProgress?.({ phase: 'creating', current: processedCount, total: preview.eligible.length });
    if (mutatingDelayMs > 0 && batchIndex < batches.length - 1) {
      await sleep(mutatingDelayMs);
    }
  }

  await flushPostingState(options, 'completed', preview.eligible.length, preview.eligible.length, summary);
  return summary;
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

      const [syncRun] = await tx.insert(ecotrackSyncRuns).values({
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
      }).returning();

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

      const [syncRun] = await tx.insert(ecotrackSyncRuns).values({
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
      }).returning();

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
