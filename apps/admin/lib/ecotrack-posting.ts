import { and, asc, eq, inArray } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { orders, orderStatusHistory } from '@bric/db/schema';
import {
  EcotrackMutationRejectedError,
  EcotrackRateLimitError,
  readEcotrackRejected,
  type EcotrackExtendedRateLimitSnapshot,
} from '@bric/storefront-core/ecotrack-client';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { readEcotrackCatalog, type EcotrackCatalogRecord } from './ecotrack-catalog';
import { applySavedEcotrackMutation } from './ecotrack-mutation-apply';
import {
  claimEcotrackMutation,
  markEcotrackMutationUncertain,
  recordEcotrackMutationResult,
  type CarrierMutation,
} from './ecotrack-mutations';
import {
  buildEcotrackResultMessage,
  chunkArray,
  getEcotrackProviderEnv,
  normalizeEcotrackPhone,
  normalizeEcotrackText,
  readEcotrackMessage,
  readEcotrackSuccess,
  readEcotrackTracking,
  requestEcotrack,
  sleep,
  type EcotrackProvider,
} from './ecotrack-provider';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import { coerceOrderStatus, type OrderRecord, type OrderStatusHistoryRecord } from './orders';

type Database = ReturnType<typeof getDb>;
const ECOTRACK_PLACEHOLDER_ADDRESS = 'Adresse non renseignee';

type EcotrackPreviewReason =
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

type EcotrackOrderPreviewItem = {
  orderId: number;
  customerName: string;
  destination: string;
  amount: string;
  payload: EcotrackOrderPayload;
};

type EcotrackOrderSkipItem = {
  orderId: number;
  customerName: string;
  reason: 'already_posted';
};

type EcotrackOrderInvalidItem = {
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

type EcotrackPostingResultItem = {
  orderId: number;
  reference: string;
  tracking: string | null;
  status: 'skipped' | 'invalid' | 'created' | 'failed';
  failureKind?: 'provider_rejected' | 'recovery_required' | 'not_sent';
  message: string;
};

export type EcotrackPostingSummary = {
  provider: EcotrackProvider;
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

export async function loadEcotrackOrderInputs(
  db: Database,
  mode: 'selected' | 'confirmed',
  orderIds: number[],
): Promise<EcotrackOrderInput[]> {
  if (orderIds.length === 0) {
    return [];
  }

  const orderRows = await db.query.orders.findMany({
    where:
      mode === 'confirmed'
        ? and(eq(orders.inHouseStatus, ORDER_STATUS.CONFIRMED), inArray(orders.id, orderIds))
        : inArray(orders.id, orderIds),
    orderBy: [asc(orders.id)],
  });

  const historyRows = await db.query.orderStatusHistory.findMany({
    where: inArray(
      orderStatusHistory.orderId,
      orderRows.map((row) => row.id),
    ),
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

  return catalog.communes.find(
    (entry) =>
      entry.wilayaId === state &&
      (String(entry.communeId) === rawCity || entry.name.toLowerCase() === rawCity.toLowerCase()),
  );
}

export function buildEcotrackOrderPayload(
  order: OrderRecord,
  catalog: EcotrackCatalogRecord,
): EcotrackOrderPayload {
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

  const product = order.orderProducts
    .map((item) => `${item.title} x${item.quantity}`)
    .join(', ')
    .trim();
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

    if (record.inHouseStatus !== ORDER_STATUS.CONFIRMED) {
      invalid.push({
        orderId: row.id,
        customerName,
        reason: 'status_not_confirmed',
        message: 'Order must be confirmed before posting.',
      });
      continue;
    }

    if (!normalizeEcotrackText(record.fullName)) {
      invalid.push({
        orderId: row.id,
        customerName,
        reason: 'missing_name',
        message: 'Customer name is required.',
      });
      continue;
    }

    if (!normalizeEcotrackPhone(record.phoneNumber1)) {
      invalid.push({
        orderId: row.id,
        customerName,
        reason: 'missing_phone',
        message: 'Primary phone number is required.',
      });
      continue;
    }

    if (record.state === null) {
      invalid.push({
        orderId: row.id,
        customerName,
        reason: 'missing_wilaya',
        message: 'Wilaya is required.',
      });
      continue;
    }

    if (!normalizeEcotrackText(record.city)) {
      invalid.push({
        orderId: row.id,
        customerName,
        reason: 'missing_commune',
        message: 'Commune is required.',
      });
      continue;
    }

    const commune = resolveEcotrackCommune(catalog, record.state, record.city);
    if (!commune) {
      invalid.push({
        orderId: row.id,
        customerName,
        reason: 'invalid_commune',
        message: 'Commune is not active or could not be resolved.',
      });
      continue;
    }

    if (record.delivery !== 1 && !normalizeEcotrackText(record.homeAddress)) {
      invalid.push({
        orderId: row.id,
        customerName,
        reason: 'missing_address',
        message: 'Delivery address is required.',
      });
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
    deadlineAt?: number;
  } = {},
) {
  const keyedOrders = Object.fromEntries(ordersBatch.map((order, index) => [String(index), order]));
  const result = await requestEcotrack({
    path: '/create/orders',
    method: 'POST',
    json: { orders: keyedOrders },
    deadlineAt: options.deadlineAt,
    fetchImpl: options.fetchImpl ?? fetch,
    env: options.env ?? process.env,
  });

  const payloadObject =
    typeof result.payload === 'object' && result.payload !== null
      ? (result.payload as Record<string, unknown>)
      : {};
  const rawResults =
    typeof payloadObject.results === 'object' && payloadObject.results !== null
      ? (payloadObject.results as Record<string, unknown>)
      : {};
  const normalized = new Map<string, EcotrackCreateOrderResult>();

  for (const [index, order] of ordersBatch.entries()) {
    const raw = rawResults[order.reference] ?? rawResults[String(index)];
    normalized.set(order.reference, {
      success: readEcotrackSuccess(raw),
      tracking: readEcotrackTracking(raw),
      message:
        readEcotrackMessage(raw) ??
        (readEcotrackSuccess(raw)
          ? null
          : buildEcotrackResultMessage(raw, 'Ecotrack rejected the order.')),
      raw,
    });
  }

  return {
    rateLimit: result.rateLimit,
    results: normalized,
    raw: result.payload,
  };
}

export async function buildEcotrackPostingPreview(
  db: Database,
  mode: 'selected' | 'confirmed',
  orderIds: number[],
) {
  const items = await loadEcotrackOrderInputs(db, mode, orderIds);
  const catalog = await readEcotrackCatalog(db);
  return classifyOrdersForEcotrackPosting(items, catalog);
}

function createPostingSummary(
  preview: EcotrackPreviewResult,
  provider: EcotrackProvider,
): EcotrackPostingSummary {
  return {
    provider,
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

function withLatestRateLimit(
  summary: EcotrackPostingSummary,
  rateLimit: EcotrackExtendedRateLimitSnapshot,
) {
  summary.rateLimits = [
    ...summary.rateLimits.filter((entry) => entry.path !== rateLimit.path),
    rateLimit,
  ];
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
  const mutatingDelayMs = Math.max(
    options.mutatingDelayMs ?? Number(env.ECOTRACK_MUTATING_DELAY_MS ?? 250),
    0,
  );
  const preview = classifyOrdersForEcotrackPosting(items, catalog);
  const summary = createPostingSummary(preview, provider);
  const inputById = new Map(items.map((item) => [item.row.id, item]));

  await flushPostingState(options, 'validating-token', 0, preview.eligible.length, summary);
  await options.throwIfCancelled?.();

  const tokenValidation = await validateEcotrackToken({ fetchImpl, env });
  withLatestRateLimit(summary, tokenValidation.rateLimit);
  await options.updateSummary?.(summary);

  if (!tokenValidation.success) {
    throw new Error(tokenValidation.message ?? 'ECOTRACK token validation failed.');
  }

  await flushPostingState(
    options,
    'classifying',
    preview.eligible.length,
    preview.eligible.length,
    summary,
  );

  const batches = chunkArray(preview.eligible, batchSize);
  let createdCount = 0;
  let processedCount = 0;

  const publish = async () => {
    // Reporting outages must not strand a successful carrier response.
    try {
      await options.updateSummary?.(summary);
    } catch (error) {
      console.error('Unable to publish carrier progress', error);
    }
  };
  for (const [batchIndex, batch] of batches.entries()) {
    await options.throwIfCancelled?.();
    const claimed: Array<{ item: EcotrackOrderPreviewItem; operation: CarrierMutation }> = [];
    for (const item of batch) {
      const input = inputById.get(item.orderId)!;
      try {
        const operation = await claimEcotrackMutation(db, {
          orderId: item.orderId,
          orderUpdatedAt: input.row.updatedAt,
          kind: 'post',
          provider,
          request: { payload: item.payload, record: input.record },
          actor,
        });
        claimed.push({ item, operation });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({
          orderId: item.orderId,
          reference: item.payload.reference,
          tracking: null,
          status: 'failed',
          failureKind: 'not_sent',
          message: error instanceof Error ? error.message : 'Unable to claim order.',
        });
      }
    }
    if (!claimed.length) continue;
    let createResponse: Awaited<ReturnType<typeof createEcotrackOrdersBatch>>;
    try {
      createResponse = await createEcotrackOrdersBatch(
        claimed.map(({ item }) => item.payload),
        {
          fetchImpl,
          env,
          deadlineAt:
            Math.min(...claimed.map(({ operation }) => operation.createdAt.getTime())) + 120_000,
        },
      );
    } catch (error) {
      const savedOutcomes = await Promise.allSettled(
        claimed.map(({ operation }) =>
          error instanceof EcotrackMutationRejectedError || error instanceof EcotrackRateLimitError
            ? recordEcotrackMutationResult(db, operation, { message: error.message }, false)
            : markEcotrackMutationUncertain(db, operation, error),
        ),
      );
      for (const [index, { item }] of claimed.entries()) {
        const rejectionRecorded =
          (error instanceof EcotrackMutationRejectedError ||
            error instanceof EcotrackRateLimitError) &&
          savedOutcomes[index]?.status === 'fulfilled';
        summary.failed += 1;
        summary.results.push({
          orderId: item.orderId,
          reference: item.payload.reference,
          tracking: null,
          status: 'failed',
          failureKind: rejectionRecorded ? 'provider_rejected' : 'recovery_required',
          message: error instanceof Error ? error.message : 'Carrier outcome needs reconciliation.',
        });
      }
      await publish();
      throw error;
    }
    withLatestRateLimit(summary, createResponse.rateLimit);
    // Finish every response in this issued batch before honoring cancellation.
    for (const { item, operation } of claimed) {
      const result = createResponse.results.get(item.payload.reference);
      let failureKind: EcotrackPostingResultItem['failureKind'] = 'recovery_required';
      try {
        if (
          !result?.raw ||
          (!result.success && !readEcotrackRejected(result.raw)) ||
          (result.success && !result.tracking)
        ) {
          await markEcotrackMutationUncertain(
            db,
            operation,
            new Error('Carrier outcome needs reconciliation.'),
          );
          throw new Error(
            'Carrier outcome needs reconciliation. Open carrier recovery before retrying.',
          );
        }
        const saved = await recordEcotrackMutationResult(db, operation, result, result.success);
        if (!result.success) {
          failureKind = 'provider_rejected';
          throw new Error(result.message ?? 'Carrier rejected the order.');
        }
        await applySavedEcotrackMutation(db, saved);
        createdCount += 1;
        summary.created = createdCount;
        summary.results.push({
          orderId: item.orderId,
          reference: item.payload.reference,
          tracking: result.tracking,
          status: 'created',
          message: result.message ?? 'Created successfully.',
        });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({
          orderId: item.orderId,
          reference: item.payload.reference,
          tracking: result?.tracking ?? null,
          status: 'failed',
          failureKind,
          message: error instanceof Error ? error.message : 'Local carrier recovery is required.',
        });
      }
      processedCount += 1;
    }
    await publish();
    try {
      await options.updateProgress?.({
        phase: 'creating',
        current: processedCount,
        total: preview.eligible.length,
      });
    } catch (error) {
      console.error('Unable to publish carrier progress', error);
    }
    if (mutatingDelayMs > 0 && batchIndex < batches.length - 1) await sleep(mutatingDelayMs);
  }

  await publish();
  return summary;
}
