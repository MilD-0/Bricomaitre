import { z } from 'zod';

import { getDb } from '@bric/db/client';
import type { ActionActor } from './action-history';
import { inspectAdminOrders } from './admin-ai-domain';
import { loadOrdersPageData } from './admin-orders-data';
import { startOrderEcotrackJob } from './background-jobs';
import { buildEcotrackPostingPreview, readEcotrackCatalog } from './ecotrack';
import { ORDER_STATUS } from './orders';

const ECOTRACK_BUSINESS_TIMEZONE = 'Africa/Algiers';
const ecotrackPostingScopeValues = [
  'selected',
  'confirmed_today',
  'confirmed_date',
  'confirmed_all',
] as const;

const nullableBusinessDateSchema = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
  .default(null);

export const adminAiEcotrackPostingPreviewSchema = z
  .object({
    scope: z.enum(ecotrackPostingScopeValues),
    orderIds: z.array(z.number().int().positive()).max(2_000).default([]),
    businessDate: nullableBusinessDateSchema,
  })
  .strict();

export const adminAiEcotrackPostingStartSchema = adminAiEcotrackPostingPreviewSchema
  .extend({
    provider: z.enum(['delivro', 'emir']),
  })
  .strict();

export const adminAiEcotrackRequirementsSchema = z
  .object({
    orderIds: z.array(z.number().int().positive()).max(50).default([]),
    provider: z.union([z.enum(['delivro', 'emir']), z.null()]).default(null),
    providerMessage: z.string().trim().max(1_000).default(''),
    wilayaId: z.union([z.number().int().min(1).max(58), z.null()]).default(null),
    communeQuery: z.string().trim().max(120).default(''),
  })
  .strict();

type EcotrackPostingScopeInput = z.input<typeof adminAiEcotrackPostingPreviewSchema>;

export type ResolvedAdminAiEcotrackPostingScope = {
  scope: (typeof ecotrackPostingScopeValues)[number];
  mode: 'selected' | 'confirmed';
  orderIds: number[];
  businessDate: string | null;
  dateBasis: 'explicit_order_selection' | 'order_created_africa_algiers' | 'all_confirmed';
};

function dateInTimezone(now: Date, timeZone = ECOTRACK_BUSINESS_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function uniqueOrderIds(orderIds: readonly number[]) {
  return [...new Set(orderIds)];
}

async function loadConfirmedOrders() {
  const items = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await loadOrdersPageData(
      {
        page,
        limit: 100,
        inHouseStatus: ORDER_STATUS.CONFIRMED,
        search: '',
        sortKey: 'createdAt',
        sortDirection: 'desc',
      },
      false,
    );
    items.push(...response.items);
    totalPages = response.pagination.totalPages;
    page += 1;
  } while (page <= totalPages);

  return items;
}

export async function resolveAdminAiEcotrackPostingScope(
  input: EcotrackPostingScopeInput,
  now = new Date(),
): Promise<ResolvedAdminAiEcotrackPostingScope> {
  const parsed = adminAiEcotrackPostingPreviewSchema.parse(input);
  if (parsed.scope === 'selected') {
    const orderIds = uniqueOrderIds(parsed.orderIds);
    if (orderIds.length === 0) {
      throw new Error('At least one exact selected order ID is required for ECOTRACK posting.');
    }
    return {
      scope: parsed.scope,
      mode: 'selected',
      orderIds,
      businessDate: null,
      dateBasis: 'explicit_order_selection',
    };
  }

  const businessDate =
    parsed.scope === 'confirmed_today'
      ? dateInTimezone(now)
      : parsed.scope === 'confirmed_date'
        ? parsed.businessDate
        : null;
  if (parsed.scope === 'confirmed_date' && !businessDate) {
    throw new Error('businessDate is required for a confirmed_date ECOTRACK scope.');
  }

  // A provider-choice follow-up must preserve the exact cohort returned by the
  // preview. Re-resolving "today" here could silently add or remove orders while
  // the operator is deciding between Delivro and Emir.
  const previewedOrderIds = uniqueOrderIds(parsed.orderIds);
  const orderIds =
    previewedOrderIds.length > 0
      ? previewedOrderIds
      : (await loadConfirmedOrders()).flatMap((order) => {
          if (!businessDate) return [order.id];
          return dateInTimezone(new Date(order.createdAt)) === businessDate ? [order.id] : [];
        });

  return {
    scope: parsed.scope,
    mode: 'confirmed',
    orderIds,
    businessDate,
    dateBasis: businessDate ? 'order_created_africa_algiers' : 'all_confirmed',
  };
}

export async function previewAdminAiEcotrackPosting(
  input: EcotrackPostingScopeInput,
  options: { now?: Date } = {},
) {
  const request = await resolveAdminAiEcotrackPostingScope(input, options.now);
  const preview = await buildEcotrackPostingPreview(getDb(), request.mode, request.orderIds);

  return {
    kind: 'ecotrack_posting_preview' as const,
    request,
    providerChoiceRequired: true,
    providerChoices: [
      { id: 'delivro' as const, label: 'Delivro' },
      { id: 'emir' as const, label: 'Emir' },
    ],
    totalRequested: preview.totalRequested,
    eligibleCount: preview.eligible.length,
    eligible: preview.eligible.map((item) => ({
      orderId: item.orderId,
      customerName: item.customerName,
      destination: item.destination,
      amount: item.amount,
    })),
    skippedCount: preview.skipped.length,
    skipped: preview.skipped,
    invalidCount: preview.invalid.length,
    invalid: preview.invalid,
    nextAction:
      preview.invalid.length > 0
        ? 'Load ECOTRACK requirements for invalid order IDs, ask the operator for Delivro or Emir, and post every eligible order without treating invalid rows as successful.'
        : 'Ask the operator to choose Delivro or Emir before posting.',
  };
}

export async function startAdminAiEcotrackPosting(
  input: z.input<typeof adminAiEcotrackPostingStartSchema>,
  context: {
    ownerKey: string;
    actor: ActionActor;
    conversationId: number;
    now?: Date;
  },
) {
  const parsed = adminAiEcotrackPostingStartSchema.parse(input);
  const request = await resolveAdminAiEcotrackPostingScope(
    {
      scope: parsed.scope,
      orderIds: parsed.orderIds,
      businessDate: parsed.businessDate,
    },
    context.now,
  );
  if (request.orderIds.length === 0) {
    return {
      ok: false as const,
      kind: 'ecotrack_posting_not_started' as const,
      provider: parsed.provider,
      request,
      error: 'No confirmed orders matched the requested ECOTRACK posting scope.',
    };
  }

  const result = await startOrderEcotrackJob(
    context.ownerKey,
    {
      mode: request.mode,
      provider: parsed.provider,
      orderIds: request.orderIds,
      actor: context.actor,
    },
    undefined,
    { conversationId: context.conversationId },
  );

  return {
    ok: result.kind !== 'busy',
    kind:
      result.kind === 'busy'
        ? ('ecotrack_posting_busy' as const)
        : ('ecotrack_posting_started' as const),
    provider: parsed.provider,
    request,
    resolvedOrderCount: request.orderIds.length,
    job: result.job,
  };
}

function normalizeLookup(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
    .trim();
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function communeMatchScore(name: string, query: string) {
  const normalizedName = normalizeLookup(name);
  const normalizedQuery = normalizeLookup(query);
  if (!normalizedQuery) return 10;
  if (normalizedName === normalizedQuery) return 0;
  if (normalizedName.startsWith(normalizedQuery)) return 1;
  if (normalizedName.includes(normalizedQuery)) return 2;
  const distance = editDistance(normalizedName, normalizedQuery);
  return distance <= Math.max(2, Math.floor(normalizedQuery.length / 4)) ? 3 + distance : 100;
}

function likelyProviderFields(message: string) {
  const normalized = normalizeLookup(message);
  const mappings = [
    { terms: ['nom client', 'client name'], fields: ['firstName', 'lastName'] },
    { terms: ['telephone', 'phone'], fields: ['phoneNumber'] },
    { terms: ['code wilaya', 'wilaya'], fields: ['wilayaId'] },
    { terms: ['commune', 'city'], fields: ['commune'] },
    { terms: ['adresse', 'address'], fields: ['homeAddress'] },
    { terms: ['montant', 'amount'], fields: ['cartProductTokens', 'delivery'] },
    { terms: ['produit', 'product'], fields: ['cartProductTokens'] },
  ];
  return [
    ...new Set(
      mappings.flatMap((mapping) =>
        mapping.terms.some((term) => normalized.includes(term)) ? mapping.fields : [],
      ),
    ),
  ];
}

export async function loadAdminAiEcotrackRequirements(
  input: z.input<typeof adminAiEcotrackRequirementsSchema>,
) {
  const parsed = adminAiEcotrackRequirementsSchema.parse(input);
  const [ordersResult, catalog] = await Promise.all([
    parsed.orderIds.length > 0
      ? inspectAdminOrders({ orderIds: uniqueOrderIds(parsed.orderIds), limit: 50 })
      : Promise.resolve({ items: [], requestedIds: [], missingIds: [] }),
    readEcotrackCatalog(getDb()),
  ]);
  const wilayaNameById = new Map(catalog.wilayas.map((wilaya) => [wilaya.wilayaId, wilaya.name]));

  const findCommunes = (wilayaId: number | null, query: string, limit = 8) =>
    catalog.communes
      .filter((commune) => wilayaId === null || commune.wilayaId === wilayaId)
      .map((commune) => ({ commune, score: communeMatchScore(commune.name, query) }))
      .filter((entry) => !query || entry.score < 100)
      .sort(
        (left, right) =>
          left.score - right.score || left.commune.name.localeCompare(right.commune.name),
      )
      .slice(0, limit)
      .map(({ commune }) => ({
        communeId: commune.communeId,
        commune: commune.name,
        wilayaId: commune.wilayaId,
        wilaya: wilayaNameById.get(commune.wilayaId) ?? null,
        postalCode: commune.postalCode,
        hasStopDesk: commune.hasStopDesk,
      }));

  const orderSuggestions = ordersResult.items.map((order) => ({
    orderId: order.id,
    currentWilayaId: order.delivery.state,
    currentCommune: order.delivery.city,
    communeMatches:
      order.delivery.state === null
        ? []
        : findCommunes(order.delivery.state, order.delivery.city ?? '', 5),
  }));

  return {
    kind: 'ecotrack_requirements' as const,
    documentation: {
      repositoryGuide: 'docs/architecture.md#fulfilment-and-carrier-boundary',
      canonicalPostingContract: 'apps/admin/lib/ecotrack.ts',
      canonicalOrderRepair: 'update_order_details',
      provider: parsed.provider,
      providerMessage: parsed.providerMessage || null,
    },
    requirements: [
      {
        reason: 'status_not_confirmed',
        requirement: 'Local order status must be confirmed (2) at posting time.',
        repairFields: ['status'],
      },
      {
        reason: 'missing_name',
        requirement:
          'Canonical fullName must be non-empty. Entered names are optional because posting falls back to the primary phone number.',
        repairFields: ['firstName', 'lastName', 'phoneNumber'],
      },
      {
        reason: 'missing_phone',
        requirement:
          'A primary phone number with digits is required; nine digits gain a leading zero.',
        repairFields: ['phoneNumber'],
      },
      {
        reason: 'missing_wilaya',
        requirement: 'A canonical ECOTRACK wilaya ID is required.',
        repairFields: ['wilayaId'],
      },
      {
        reason: 'missing_commune',
        requirement: 'A commune is required and must resolve inside the selected wilaya.',
        repairFields: ['commune'],
      },
      {
        reason: 'invalid_commune',
        requirement:
          'The commune must match a live canonical ECOTRACK commune ID or name in the selected wilaya.',
        repairFields: ['wilayaId', 'commune'],
      },
      {
        reason: 'missing_address',
        requirement: 'Home delivery requires a non-empty address; stop-desk delivery does not.',
        repairFields: ['delivery', 'homeAddress'],
      },
    ],
    payloadFieldMapping: {
      nom_client: ['firstName', 'lastName'],
      telephone: ['phoneNumber'],
      telephone_2: ['phoneNumber2'],
      code_wilaya: ['wilayaId'],
      commune: ['commune'],
      adresse: ['homeAddress'],
      montant: ['cartProductTokens', 'delivery'],
      produit: ['cartProductTokens'],
      remarque: ['note'],
      stop_desk: ['delivery'],
    },
    likelyRepairFields: likelyProviderFields(parsed.providerMessage),
    orders: ordersResult,
    orderSuggestions,
    matchingDestinations: findCommunes(parsed.wilayaId, parsed.communeQuery, 20),
    catalogAsOf: catalog.lastSync?.finishedAt?.toISOString() ?? null,
  };
}
