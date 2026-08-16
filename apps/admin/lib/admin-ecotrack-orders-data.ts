import { and, desc, eq, inArray, isNull, max, sql } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';

import {
  addEcotrackMaj as addEcotrackMajUpstream,
  deleteEcotrackOrder,
  dispatchEcotrackOrder,
  fetchEcotrackOrderLabel,
  getEcotrackMaj,
  getEcotrackOrdersStatus,
  getEcotrackTrackingsInfo,
  requestEcotrackReturn as requestEcotrackReturnUpstream,
  type EcotrackMajEntry as UpstreamEcotrackMajEntry,
  type EcotrackStatusItem,
  type EcotrackTrackingInfo,
  updateEcotrackOrder,
} from '@bric/storefront-core/ecotrack-client';
import { readEcotrackActivityTimestamp } from '@bric/storefront-core/ecotrack-tracking';

import { getDb, hasDb } from '@bric/db/client';
import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orderStatusHistory,
  orders,
  products,
} from '@bric/db/schema';
import { recordExplicitActionLog, type ActionActor } from './action-history';
import type {
  EcotrackBulkActionFailure,
  EcotrackBulkActionResponse,
  EcotrackDispatchBatchResponse,
  EcotrackLabelItem,
  EcotrackLabelsResponse,
  EcotrackShipmentDetail,
  EcotrackShipmentListItem,
  EcotrackShipmentsResponse,
  EcotrackStatusSummary,
} from './ecotrack-admin-contracts';
import {
  areEcotrackActionSnapshotsEqual,
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from './ecotrack-action-snapshots';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import {
  buildEcotrackOrderPayload,
  createEcotrackOrdersBatch,
  getEcotrackProviderEnv,
  persistEcotrackPostedOrder,
  readEcotrackCatalog,
} from './ecotrack';
import { parseSortRuleStrings } from './multi-sort';
import {
  coerceOrderStatus,
  isConfirmedLifecycleStatus,
  parseNumericAmount,
  type DeliveryType,
  type OrderRecord,
  type OrderStatus,
} from './orders';

const ecotrackShipmentSortKeyValues = [
  'createdAt',
  'trackingNumber',
  'clientName',
  'currentStatus',
  'lastStatusSyncedAt',
] as const;
const ecotrackShipmentSortKeySchema = z.enum(ecotrackShipmentSortKeyValues);
const ecotrackShipmentSortDirectionSchema = z.enum(['asc', 'desc']);
export type EcotrackShipmentListQueryInput = {
  page?: string | number | undefined;
  limit?: string | number | undefined;
  search?: string | undefined;
  status?: string | undefined;
  staleOnly?: string | boolean | undefined;
  sort?: string[] | undefined;
  sortKey?: string | undefined;
  sortDirection?: string | undefined;
};

type EcotrackListLoadOptions = {
  ensureFreshVisiblePage?: boolean;
  actor?: ActionActor | null;
};

export const ecotrackShipmentListQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
    search: z.string().trim().default(''),
    status: z.string().trim().default('all'),
    staleOnly: z
      .union([z.boolean(), z.string(), z.undefined()])
      .transform((value) => value === true || value === 'true')
      .default(false),
    sort: z.array(z.string().trim()).optional().default([]),
    sortKey: ecotrackShipmentSortKeySchema.default('createdAt'),
    sortDirection: ecotrackShipmentSortDirectionSchema.default('desc'),
  })
  .transform((value, ctx) => {
    const parsedSortRules = parseSortRuleStrings(value.sort, ecotrackShipmentSortKeyValues);

    if (!parsedSortRules.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: parsedSortRules.issue,
        path: ['sort'],
      });

      return z.NEVER;
    }

    return {
      ...value,
      sortRules:
        parsedSortRules.rules.length > 0
          ? parsedSortRules.rules
          : [{ key: value.sortKey, direction: value.sortDirection }],
    };
  });

const nullableNonNegativeAmountSchema = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null) {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      return Number.NaN;
    }

    return Number(parsed.toFixed(2));
  });

const ecotrackShipmentUpdateDraftSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().max(80).default(''),
    phoneNumber1: z.string().trim().min(1).max(50),
    phoneNumber2: z.string().trim().max(50).nullable().optional().default(null),
    delivery: z.union([z.literal(0), z.literal(1)]),
    state: z.number().int().min(1).max(58).nullable(),
    city: z.string().trim().min(1).max(120),
    homeAddress: z.string().trim().max(300),
    note: z.string().trim().max(500).nullable().optional().default(null),
    cartProducts: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    deliveryFee: nullableNonNegativeAmountSchema.optional().default(null),
    subtotalOverride: nullableNonNegativeAmountSchema.optional().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.delivery === 0 && value.homeAddress.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Delivery address is required.',
        path: ['homeAddress'],
      });
    }

    if (value.deliveryFee !== null && Number.isNaN(value.deliveryFee)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Delivery fee must be a non-negative amount.',
        path: ['deliveryFee'],
      });
    }

    if (value.subtotalOverride !== null && Number.isNaN(value.subtotalOverride)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Subtotal override must be a non-negative amount.',
        path: ['subtotalOverride'],
      });
    }
  });

const ecotrackMajCreateRequestSchema = z.object({
  content: z.string().trim().min(1).max(255),
});

const ecotrackDispatchRequestSchema = z.object({
  askCollection: z.boolean().default(false),
});

const ecotrackBulkActionSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1).max(100),
});

const ecotrackBulkDispatchRequestSchema = ecotrackBulkActionSchema.extend({
  askCollection: z.boolean().default(false),
});

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type EcotrackShipmentListQuery = z.infer<typeof ecotrackShipmentListQuerySchema>;
export type EcotrackOrderUpdateDraft = z.infer<typeof ecotrackShipmentUpdateDraftSchema>;
export type EcotrackDispatchRequest = z.infer<typeof ecotrackDispatchRequestSchema>;

type EcotrackOrderListItem = EcotrackShipmentListItem;
export type EcotrackOrderDetail = EcotrackShipmentDetail;

export type EcotrackOperation =
  'refresh' | 'update' | 'delete' | 'dispatch' | 'maj' | 'return' | 'label' | 'detail' | 'recreate';

export type EcotrackActionErrorDetail = {
  orderId: number | null;
  reference: string | null;
  trackingNumber: string | null;
  operation: EcotrackOperation;
  summary: string;
  upstreamPath: string | null;
  statusCode: number | null;
  rawMessage: string;
};

type EcotrackRefreshFailure = EcotrackBulkActionFailure;
export type EcotrackRefreshBatchResult = EcotrackBulkActionResponse<EcotrackOrderDetail>;
export type EcotrackDispatchBatchResult = EcotrackDispatchBatchResponse;
export type EcotrackBulkLabelResult = EcotrackLabelsResponse;
export type EcotrackOrderListResponse = EcotrackShipmentsResponse;
type ShipmentRow = typeof ecotrackOrderStates.$inferSelect & {
  order: typeof orders.$inferSelect;
};

const TERMINAL_STATUSES = new Set(['annule', 'paye_et_archive', 'retour_archive']);
const STATUS_STALE_MS = 15 * 60 * 1000;
const TRACKING_STALE_MS = 30 * 60 * 1000;
const MAJ_STALE_MS = 30 * 60 * 1000;
const FAILED_STATUS_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;
const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';
const ECOTRACK_DISPATCHED_STATUSES = new Set([
  'en_ramassage',
  'en_preparation_stock',
  'en_preparation',
]);
const ECOTRACK_IN_DELIVERY_STATUSES = new Set([
  'en_livraison',
  'en_hub',
  'vers_wilaya',
  'vers_hub',
]);
const ECOTRACK_COMPLETED_STATUSES = new Set([
  'livre_non_encaisse',
  'encaisse_non_paye',
  'paiements_prets',
  'paye_et_archive',
]);
const ECOTRACK_RETURNED_STATUSES = new Set([
  'retour_chez_livreur',
  'retour_transit_entrepot',
  'retour_en_traitement',
  'retour_recu',
  'retour_archive',
]);

function resolveEcotrackActor(actor?: ActionActor | null): ActionActor {
  if (actor?.email || actor?.name) {
    return actor;
  }

  return {
    email: null,
    name: ECOTRACK_SYNC_ACTOR_NAME,
  };
}

async function loadMajSyncSummary(
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

async function loadTrackingSyncSummary(
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

async function recordEcotrackMajAction(
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

async function recordEcotrackTrackingAction(
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

function isoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function getStatusTimestamp(value: Date | null | undefined) {
  return value?.getTime() ?? 0;
}

function isStaleAt(value: Date | null | undefined, maxAgeMs: number) {
  if (!value) {
    return true;
  }

  return Date.now() - value.getTime() >= maxAgeMs;
}

function mapDeliveryLabel(delivery: DeliveryType) {
  return delivery === 1 ? 'office' : 'home';
}

function sanitizeNullableText(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function isMongoObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

async function canonicalizeOrderCartProducts(db: Database, cartProducts: string[]) {
  const normalized = cartProducts
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) =>
      /^\d+$/.test(value) && !isMongoObjectId(value) ? String(Number.parseInt(value, 10)) : value,
    );
  const mongoIds = [...new Set(normalized.filter(isMongoObjectId))];

  if (mongoIds.length === 0) {
    return normalized;
  }

  const productRows = await db
    .select({ id: products.id, mongoId: products.mongoId })
    .from(products)
    .where(inArray(products.mongoId, mongoIds));
  const lookup = new Map<string, string>();

  for (const product of productRows) {
    if (product.mongoId) {
      lookup.set(product.mongoId, String(product.id));
    }
  }

  return normalized.map((value) => lookup.get(value) ?? value);
}

function getActionFlags(currentStatus: string, deletedAt: Date | null) {
  const isVisible = deletedAt === null;
  const isEditable = currentStatus === 'prete_a_expedier' && isVisible;
  return {
    canEdit: isEditable,
    canDelete: isEditable,
    canDispatch: isEditable,
    canEditAndRecreate: isVisible && currentStatus !== 'prete_a_expedier',
    canAddMaj:
      isVisible && currentStatus !== 'prete_a_expedier' && !TERMINAL_STATUSES.has(currentStatus),
    canAskReturn: isVisible && currentStatus === 'en_livraison',
    canPrintLabel: isVisible,
  };
}

function buildStatusSummary(row: typeof ecotrackOrderStates.$inferSelect): EcotrackStatusSummary {
  return {
    currentStatus: row.currentStatus,
    driverPhone: sanitizeNullableText(row.driverPhone),
    estimatedFee: row.estimatedFee === null ? null : parseNumericAmount(row.estimatedFee),
    deskPhone: sanitizeNullableText(row.deskPhone),
    deskCommune: sanitizeNullableText(row.deskCommune),
    deskMapLink: sanitizeNullableText(row.deskMapLink),
    deskAddress: sanitizeNullableText(row.deskAddress),
    lastStatusSyncedAt: isoOrNull(row.lastStatusSyncedAt),
    lastTrackingSyncedAt: isoOrNull(row.lastTrackingSyncedAt),
    lastMajSyncedAt: isoOrNull(row.lastMajSyncedAt),
    isStatusStale: isStaleAt(row.lastStatusSyncedAt, STATUS_STALE_MS),
    isTrackingStale: isStaleAt(row.lastTrackingSyncedAt, TRACKING_STALE_MS),
    isMajStale: isStaleAt(row.lastMajSyncedAt, MAJ_STALE_MS),
  };
}

function toListItem(
  row: ShipmentRow,
  record: OrderRecord,
  stateNameById: Map<number, string>,
): EcotrackOrderListItem {
  return {
    orderId: row.order.id,
    reference: row.reference,
    trackingNumber: row.trackingNumber,
    provider: row.provider === 'emir' ? 'emir' : 'delivro',
    createdAt: row.order.createdAt.toISOString(),
    updatedAt: row.order.updatedAt.toISOString(),
    firstName: row.order.firstName,
    lastName: row.order.lastName,
    fullName: record.fullName,
    phoneNumber1: row.order.phoneNumber1,
    phoneNumber2: row.order.phoneNumber2,
    delivery: record.delivery,
    deliveryLabel: mapDeliveryLabel(record.delivery),
    state: row.order.state,
    stateName: row.order.state === null ? null : (stateNameById.get(row.order.state) ?? null),
    city: row.order.city,
    homeAddress: row.order.homeAddress,
    orderProducts: record.orderProducts,
    subtotalOverride: record.subtotalOverride,
    productSubtotal: record.productSubtotal,
    deliveryFee: record.deliveryFee,
    totalAmount: record.totalAmount,
    note: row.order.note,
    status: buildStatusSummary(row),
    ...getActionFlags(row.currentStatus, row.deletedAt),
  };
}

function applySearch(items: EcotrackOrderListItem[], search: string) {
  if (!search) {
    return items;
  }

  const normalized = search.toLowerCase();
  return items.filter(
    (item) =>
      item.trackingNumber.toLowerCase().includes(normalized) ||
      item.fullName.toLowerCase().includes(normalized) ||
      item.phoneNumber1.toLowerCase().includes(normalized) ||
      (item.phoneNumber2?.toLowerCase().includes(normalized) ?? false) ||
      (item.homeAddress?.toLowerCase().includes(normalized) ?? false) ||
      (item.city?.toLowerCase().includes(normalized) ?? false) ||
      (item.stateName?.toLowerCase().includes(normalized) ?? false) ||
      String(item.state ?? '').includes(normalized) ||
      item.status.currentStatus.toLowerCase().includes(normalized) ||
      item.orderProducts.some((product) => product.title.toLowerCase().includes(normalized)),
  );
}

function applySort(items: EcotrackOrderListItem[], query: EcotrackShipmentListQuery) {
  return [...items].sort((left, right) => {
    for (const rule of query.sortRules) {
      const direction = rule.direction === 'asc' ? 1 : -1;

      if (rule.key === 'trackingNumber') {
        const delta = left.trackingNumber.localeCompare(right.trackingNumber);
        if (delta !== 0) {
          return delta * direction;
        }
        continue;
      }

      if (rule.key === 'clientName') {
        const delta = left.fullName.localeCompare(right.fullName);
        if (delta !== 0) {
          return delta * direction;
        }
        continue;
      }

      if (rule.key === 'currentStatus') {
        const delta = left.status.currentStatus.localeCompare(right.status.currentStatus);
        if (delta !== 0) {
          return delta * direction;
        }
        continue;
      }

      if (rule.key === 'lastStatusSyncedAt') {
        const delta =
          getStatusTimestamp(new Date(left.status.lastStatusSyncedAt ?? 0)) -
          getStatusTimestamp(new Date(right.status.lastStatusSyncedAt ?? 0));
        if (delta !== 0) {
          return delta * direction;
        }
        continue;
      }

      const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (delta !== 0) {
        return delta * direction;
      }
    }

    return right.orderId - left.orderId;
  });
}

function paginateItems<T>(items: T[], page: number, limit: number) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  return {
    pageItems: items.slice(start, start + limit),
    pagination: {
      page: safePage,
      limit,
      totalItems,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPreviousPage: safePage > 1,
    },
  };
}

async function loadActiveShipmentRows(db: Database) {
  const rows = await db
    .select({
      state: ecotrackOrderStates,
      order: orders,
    })
    .from(ecotrackOrderStates)
    .innerJoin(orders, eq(ecotrackOrderStates.orderId, orders.id))
    .where(and(isNull(ecotrackOrderStates.deletedAt), isNull(orders.archivedAt)))
    .orderBy(desc(ecotrackOrderStates.updatedAt), desc(ecotrackOrderStates.id));

  return rows.map((entry) => ({ ...entry.state, order: entry.order })) as ShipmentRow[];
}

function buildListItems(
  rows: ShipmentRow[],
  productLookup: Awaited<ReturnType<typeof getOrderProductLookup>>,
  stateNameById: Map<number, string>,
) {
  return rows.map((row) => ({
    row,
    item: toListItem(row, toOrderRecord(row.order, [], productLookup), stateNameById),
  }));
}

function applyListQuery(
  entries: Array<{ row: ShipmentRow; item: EcotrackOrderListItem }>,
  query: EcotrackShipmentListQuery,
) {
  let items = entries.map((entry) => entry.item);

  if (query.status !== 'all') {
    items = items.filter((item) => item.status.currentStatus === query.status);
  }

  if (query.staleOnly) {
    items = items.filter(
      (item) => item.status.isStatusStale || item.status.isTrackingStale || item.status.isMajStale,
    );
  }

  items = applySearch(items, query.search);
  items = applySort(items, query);

  return paginateItems(items, query.page, query.limit);
}

async function loadShipmentRowByOrderId(db: Database, orderId: number) {
  const rows = await db
    .select({
      state: ecotrackOrderStates,
      order: orders,
    })
    .from(ecotrackOrderStates)
    .innerJoin(orders, eq(ecotrackOrderStates.orderId, orders.id))
    .where(
      and(
        eq(ecotrackOrderStates.orderId, orderId),
        isNull(ecotrackOrderStates.deletedAt),
        isNull(orders.archivedAt),
      ),
    )
    .limit(1);

  const row = rows[0];
  return row ? ({ ...row.state, order: row.order } as ShipmentRow) : undefined;
}

function getUpstreamTrackingValues(item: EcotrackStatusItem) {
  return {
    currentStatus: item.status,
    driverPhone: sanitizeNullableText(item.driver_phone),
    estimatedFee: item.estimated_fee == null ? null : String(item.estimated_fee),
    deskPhone: sanitizeNullableText(item.desk_phone),
    deskCommune: sanitizeNullableText(item.desk_commune),
    deskMapLink: sanitizeNullableText(item.desk_map_link),
    deskAddress: sanitizeNullableText(item.desk_address),
  };
}

function providerRequestOptions(row: Pick<ShipmentRow, 'provider'>) {
  return { env: getEcotrackProviderEnv(row.provider === 'emir' ? 'emir' : 'delivro') };
}

function mapMajEntry(entry: UpstreamEcotrackMajEntry) {
  const parsed = new Date(entry.created_at);
  return {
    remarque: entry.remarque,
    station: sanitizeNullableText(entry.station),
    livreur: sanitizeNullableText(entry.livreur),
    remoteCreatedAt: Number.isNaN(parsed.getTime()) ? new Date() : parsed,
    raw: entry,
  };
}

function mapTrackingInfoEvents(
  orderId: number,
  trackingNumber: string,
  trackingInfo: EcotrackTrackingInfo,
) {
  return trackingInfo.activity
    .map((entry) => ({
      orderId,
      trackingNumber,
      eventDate: entry.date,
      eventTime: entry.time,
      status: entry.status,
      scanLocation: sanitizeNullableText(entry.scanLocation),
      raw: entry,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    .filter((entry) => Boolean(entry.eventDate && entry.eventTime && entry.status));
}

function parseEcotrackUpstreamFailure(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const requestFailure = rawMessage.match(/^ECOTRACK request failed for ([^:]+): (\d{3})\s*(.*)$/);
  if (requestFailure) {
    const [, upstreamPath, statusCodeText, tail] = requestFailure;
    return {
      rawMessage,
      upstreamPath,
      statusCode: Number(statusCodeText),
      upstreamMessage: extractEcotrackPayloadMessage(tail),
    };
  }

  return {
    rawMessage,
    upstreamPath: null,
    statusCode: null,
    upstreamMessage: rawMessage,
  };
}

function extractEcotrackPayloadMessage(payload: string) {
  const trimmed = payload.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const candidates = [
      parsed.message,
      parsed.error,
      parsed.detail,
      typeof parsed.data === 'object' && parsed.data
        ? (parsed.data as Record<string, unknown>).message
        : null,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {}

  return trimmed;
}

function toEcotrackOperationFailureReason(operation: EcotrackOperation, error: unknown) {
  const parsed = parseEcotrackUpstreamFailure(error);
  const lowered = `${parsed.upstreamMessage} ${parsed.rawMessage}`.toLowerCase();

  if (parsed.statusCode === 429 || lowered.includes('rate limit')) {
    return {
      parsed,
      summary: 'Ecotrack rate-limited the request.',
    };
  }

  if (lowered.includes('invalid json')) {
    return {
      parsed,
      summary: 'Ecotrack returned invalid data.',
    };
  }

  if (
    (parsed.statusCode === 404 && parsed.upstreamPath?.includes('/get/tracking')) ||
    lowered.includes('tracking not found')
  ) {
    return {
      parsed,
      summary:
        operation === 'label'
          ? 'The label is unavailable because the tracking number was not found upstream.'
          : 'The tracking number was not found upstream.',
    };
  }

  if (operation === 'dispatch' && (parsed.statusCode === 400 || parsed.statusCode === 409)) {
    return {
      parsed,
      summary: 'The shipment cannot be dispatched in its current Ecotrack state.',
    };
  }

  if (operation === 'update' && (parsed.statusCode === 400 || parsed.statusCode === 409)) {
    return {
      parsed,
      summary: 'The shipment cannot be updated in its current Ecotrack state.',
    };
  }

  if (operation === 'return' && (parsed.statusCode === 400 || parsed.statusCode === 409)) {
    return {
      parsed,
      summary: 'The return request was rejected by Ecotrack.',
    };
  }

  if (operation === 'maj' && (parsed.statusCode === 400 || parsed.statusCode === 409)) {
    return {
      parsed,
      summary: 'Ecotrack rejected the follow-up update.',
    };
  }

  if (
    operation === 'label' &&
    (parsed.statusCode === 400 || parsed.statusCode === 404 || parsed.statusCode === 409)
  ) {
    return {
      parsed,
      summary: 'The label is unavailable from Ecotrack.',
    };
  }

  if (parsed.upstreamMessage) {
    return {
      parsed,
      summary: parsed.upstreamMessage,
    };
  }

  return {
    parsed,
    summary: 'Ecotrack rejected the request.',
  };
}

function formatEcotrackActionError(
  operation: EcotrackOperation,
  row: Pick<ShipmentRow, 'trackingNumber' | 'reference' | 'order'> | null,
  error: unknown,
): EcotrackActionErrorDetail {
  const { parsed, summary } = toEcotrackOperationFailureReason(operation, error);
  const contextParts = [
    row?.order?.id ? `Order #${row.order.id}` : null,
    row?.reference ? `Ref ${row.reference}` : null,
    row?.trackingNumber ? `Tracking ${row.trackingNumber}` : null,
  ].filter(Boolean);

  return {
    orderId: row?.order?.id ?? null,
    reference: row?.reference ?? null,
    trackingNumber: row?.trackingNumber ?? null,
    operation,
    summary: contextParts.length > 0 ? `${contextParts.join(' / ')}: ${summary}` : summary,
    upstreamPath: parsed.upstreamPath,
    statusCode: parsed.statusCode,
    rawMessage: parsed.rawMessage,
  };
}

function toEcotrackFailureRecord(
  operation: EcotrackOperation,
  row: Pick<ShipmentRow, 'trackingNumber' | 'reference' | 'order'> | null,
  error: unknown,
  fallbackOrderId?: number,
): EcotrackBulkActionFailure {
  const detail = formatEcotrackActionError(operation, row, error);

  return {
    orderId: detail.orderId ?? fallbackOrderId ?? 0,
    reference: detail.reference,
    trackingNumber: detail.trackingNumber,
    message: detail.summary,
  };
}

function findLatestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value || Number.isNaN(value.getTime())) {
      return latest;
    }

    if (!latest || value.getTime() > latest.getTime()) {
      return value;
    }

    return latest;
  }, null);
}

function isEcotrackRequestFailure(error: unknown, pathPrefix: string, status: number) {
  const message = error instanceof Error ? error.message : '';
  return (
    message.includes(`ECOTRACK request failed for ${pathPrefix}`) &&
    message.includes(`: ${status} `)
  );
}

function isEcotrackMissingTrackingInfoError(error: unknown) {
  return (
    isEcotrackRequestFailure(error, '/get/trackings/info', 404) ||
    isEcotrackRequestFailure(error, '/get/tracking/info', 404)
  );
}

async function softDeleteShipmentRow(
  db: Database,
  row: ShipmentRow,
  options: {
    actor?: ActionActor | null;
    operation?: 'update' | 'delete';
  } = {},
) {
  const now = new Date();
  const beforeOrderState = buildEcotrackOrderActionSnapshot(row.order);
  const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        ecotrackStatus: null,
        ecotrackStatusLastUpdate: null,
        ecotrackStatusData: null,
        ecotrackReference: null,
        ecotrackTrackingNumber: null,
        updatedAt: now,
      })
      .where(eq(orders.id, row.order.id));

    await tx
      .update(ecotrackOrderStates)
      .set({
        deletedAt: now,
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));

    const afterOrderState = {
      ...beforeOrderState,
      ecotrackStatus: null,
      ecotrackStatusLastUpdate: null,
      ecotrackStatusData: null,
      ecotrackReference: null,
      ecotrackTrackingNumber: null,
      updatedAt: now,
    };
    const afterShipmentState = {
      ...beforeShipmentState,
      deletedAt: now,
      lastActionAt: now,
      updatedAt: now,
    };

    await recordEcotrackOrderAction(tx, beforeOrderState, afterOrderState, options.actor);
    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      options.actor,
      options.operation ?? 'delete',
    );
  });
}

async function getEcotrackTrackingsInfoAllowingMissing(
  trackings: string[],
  options?: Parameters<typeof getEcotrackTrackingsInfo>[1],
) {
  try {
    const response = options
      ? await getEcotrackTrackingsInfo(trackings, options)
      : await getEcotrackTrackingsInfo(trackings);
    return {
      data: response.data,
      missing: new Set<string>(),
    };
  } catch (error) {
    if (!isEcotrackMissingTrackingInfoError(error)) {
      throw error;
    }

    return {
      data: new Map<string, EcotrackTrackingInfo>(),
      missing: new Set(trackings),
    };
  }
}

export function deriveLatestUpstreamActivityAt(
  row: ShipmentRow,
  payload: {
    statusItem?: EcotrackStatusItem | null;
    trackingInfo?: EcotrackTrackingInfo | null;
    majEntries?: UpstreamEcotrackMajEntry[] | null;
  },
) {
  const latestActivity = findLatestDate([
    ...(payload.statusItem?.activity ?? []).map((entry) => readEcotrackActivityTimestamp(entry)),
    ...(payload.trackingInfo?.activity ?? []).map((entry) => readEcotrackActivityTimestamp(entry)),
    ...(payload.majEntries ?? []).map((entry) => readEcotrackActivityTimestamp(entry)),
  ]);

  return latestActivity ?? row.order.ecotrackStatusLastUpdate ?? row.createdAt;
}

export function mapEcotrackStatusToOrderStatus(
  currentStatus: string,
  latestUpstreamActivityAt: Date | null,
): OrderStatus | null {
  const normalized = currentStatus.trim().toLowerCase();

  if (ECOTRACK_DISPATCHED_STATUSES.has(normalized)) {
    return 3;
  }

  if (ECOTRACK_IN_DELIVERY_STATUSES.has(normalized)) {
    return 7;
  }

  if (normalized === 'suspendu') {
    return 5;
  }

  if (normalized === 'annule') {
    return 6;
  }

  if (ECOTRACK_COMPLETED_STATUSES.has(normalized)) {
    return 4;
  }

  if (ECOTRACK_RETURNED_STATUSES.has(normalized)) {
    return 8;
  }

  if (
    latestUpstreamActivityAt &&
    Date.now() - latestUpstreamActivityAt.getTime() >= FAILED_STATUS_MAX_AGE_MS
  ) {
    return 9;
  }

  return null;
}

async function upsertShipmentState(
  db: Database,
  row: ShipmentRow,
  payload: {
    statusItem?: EcotrackStatusItem | null;
    trackingInfo?: EcotrackTrackingInfo | null;
    majEntries?: UpstreamEcotrackMajEntry[] | null;
  },
  actor?: ActionActor | null,
) {
  const now = new Date();
  const updates: Partial<typeof ecotrackOrderStates.$inferInsert> = {
    updatedAt: now,
  };

  if (payload.statusItem) {
    const current = getUpstreamTrackingValues(payload.statusItem);
    updates.currentStatus = current.currentStatus;
    updates.driverPhone = current.driverPhone;
    updates.estimatedFee = current.estimatedFee;
    updates.deskPhone = current.deskPhone;
    updates.deskCommune = current.deskCommune;
    updates.deskMapLink = current.deskMapLink;
    updates.deskAddress = current.deskAddress;
    updates.rawStatusPayload = payload.statusItem;
    updates.lastStatusSyncedAt = now;
  }

  if (payload.trackingInfo) {
    updates.rawLastTrackingPayload = payload.trackingInfo;
    updates.lastTrackingSyncedAt = now;
  }

  if (payload.majEntries) {
    updates.rawLastMajPayload = payload.majEntries;
    updates.lastMajSyncedAt = now;
  }

  await db.transaction(async (tx) => {
    const beforeOrderState = buildEcotrackOrderActionSnapshot(row.order);
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);
    const beforeMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);
    const beforeTrackingState = await loadTrackingSyncSummary(tx, row.order.id, row.trackingNumber);

    await tx.update(ecotrackOrderStates).set(updates).where(eq(ecotrackOrderStates.id, row.id));

    const nextLocalStatus = payload.statusItem
      ? mapEcotrackStatusToOrderStatus(
          payload.statusItem.status,
          deriveLatestUpstreamActivityAt(row, payload),
        )
      : null;
    const currentLocalStatus = coerceOrderStatus(row.order.confirmed);

    if (payload.statusItem) {
      const nextOrderValues: Partial<typeof orders.$inferInsert> = {
        ecotrackStatus: payload.statusItem.status,
        ecotrackStatusLastUpdate: now,
        ecotrackStatusData: payload.statusItem,
        updatedAt: now,
      };

      if (nextLocalStatus !== null && nextLocalStatus !== currentLocalStatus) {
        nextOrderValues.confirmed = nextLocalStatus;
        nextOrderValues.noAnswerCount = 0;

        if (isConfirmedLifecycleStatus(nextLocalStatus)) {
          nextOrderValues.confirmedBy = row.order.confirmedBy ?? null;
          nextOrderValues.confirmedByName = row.order.confirmedByName ?? null;
          nextOrderValues.confirmedAt = row.order.confirmedAt ?? now;
        } else {
          nextOrderValues.confirmedBy = null;
          nextOrderValues.confirmedByName = null;
          nextOrderValues.confirmedAt = null;
        }
      }

      await tx.update(orders).set(nextOrderValues).where(eq(orders.id, row.order.id));

      if (nextLocalStatus !== null && nextLocalStatus !== currentLocalStatus) {
        await tx.insert(orderStatusHistory).values({
          orderId: row.order.id,
          status: nextLocalStatus,
          noAnswerCount: 0,
          changedBy: null,
          changedByName: ECOTRACK_SYNC_ACTOR_NAME,
          changedAt: now,
        });
      }
    }

    if (payload.majEntries) {
      const majValues = payload.majEntries.map((entry) => ({
        orderId: row.order.id,
        trackingNumber: row.trackingNumber,
        ...mapMajEntry(entry),
        createdAt: now,
        updatedAt: now,
      }));
      if (majValues.length > 0) {
        await tx.insert(ecotrackOrderMajEntries).values(majValues).onConflictDoNothing();
      }
    }

    if (payload.trackingInfo) {
      const trackingValues = mapTrackingInfoEvents(
        row.order.id,
        row.trackingNumber,
        payload.trackingInfo,
      );
      if (trackingValues.length > 0) {
        await tx.insert(ecotrackOrderTrackingEvents).values(trackingValues).onConflictDoNothing();
      }
    }

    const afterOrderState = {
      ...beforeOrderState,
      ...(payload.statusItem
        ? {
            ecotrackStatus: payload.statusItem.status,
            ecotrackStatusLastUpdate: now,
            ecotrackStatusData: payload.statusItem,
            updatedAt: now,
          }
        : {}),
      ...(nextLocalStatus !== null && nextLocalStatus !== currentLocalStatus
        ? {
            confirmed: nextLocalStatus,
            noAnswerCount: 0,
            confirmedBy: isConfirmedLifecycleStatus(nextLocalStatus)
              ? (row.order.confirmedBy ?? null)
              : null,
            confirmedByName: isConfirmedLifecycleStatus(nextLocalStatus)
              ? (row.order.confirmedByName ?? null)
              : null,
            confirmedAt: isConfirmedLifecycleStatus(nextLocalStatus)
              ? (row.order.confirmedAt ?? now)
              : null,
          }
        : {}),
    };
    const afterShipmentState = {
      ...beforeShipmentState,
      ...updates,
    };
    const afterMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);
    const afterTrackingState = await loadTrackingSyncSummary(tx, row.order.id, row.trackingNumber);

    await recordEcotrackOrderAction(tx, beforeOrderState, afterOrderState, actor);
    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
    await recordEcotrackMajAction(tx, row.order.id, beforeMajState, afterMajState, actor);
    await recordEcotrackTrackingAction(
      tx,
      row.order.id,
      beforeTrackingState,
      afterTrackingState,
      actor,
    );
  });
}

async function refreshShipmentRow(
  db: Database,
  row: ShipmentRow,
  options: {
    includeMaj?: boolean;
    includeTracking?: boolean;
    actor?: ActionActor | null;
  } = {},
) {
  const [statusResponse, trackingResponse, majResponse] = await Promise.all([
    getEcotrackOrdersStatus([row.trackingNumber], 'all', providerRequestOptions(row)),
    options.includeTracking === false
      ? Promise.resolve(null)
      : getEcotrackTrackingsInfoAllowingMissing([row.trackingNumber], providerRequestOptions(row)),
    options.includeMaj === false
      ? Promise.resolve(null)
      : getEcotrackMaj(row.trackingNumber, providerRequestOptions(row)),
  ]);

  if (trackingResponse?.missing.has(row.trackingNumber)) {
    await softDeleteShipmentRow(db, row, { actor: options.actor, operation: 'delete' });
    return null;
  }

  await upsertShipmentState(
    db,
    row,
    {
      statusItem: statusResponse.data.get(row.trackingNumber) ?? null,
      trackingInfo: trackingResponse?.data.get(row.trackingNumber) ?? null,
      majEntries: majResponse?.data ?? null,
    },
    options.actor,
  );

  const refreshedRow = await loadShipmentRowByOrderId(db, row.order.id);
  return refreshedRow ? buildEcotrackOrderDetailFromRow(db, refreshedRow) : null;
}

async function ensureFreshShipmentRow(
  db: Database,
  row: ShipmentRow,
  options: {
    includeMaj?: boolean;
    includeTracking?: boolean;
    actor?: ActionActor | null;
  } = {},
) {
  const mustRefresh =
    isStaleAt(row.lastStatusSyncedAt, STATUS_STALE_MS) ||
    (options.includeTracking !== false && isStaleAt(row.lastTrackingSyncedAt, TRACKING_STALE_MS)) ||
    (options.includeMaj !== false && isStaleAt(row.lastMajSyncedAt, MAJ_STALE_MS));

  if (!mustRefresh) {
    return buildEcotrackOrderDetailFromRow(db, row);
  }

  return refreshShipmentRow(db, row, options);
}

async function buildEcotrackOrderDetailFromRow(
  db: Database,
  row: ShipmentRow,
): Promise<EcotrackOrderDetail> {
  const [productLookup, catalog] = await Promise.all([
    getOrderProductLookup(db, [row.order]),
    readEcotrackCatalog(db),
  ]);
  const record = toOrderRecord(row.order, [], productLookup);
  const stateNameById = new Map(catalog.wilayas.map((entry) => [entry.wilayaId, entry.name]));
  const [majRows, trackingRows] = await Promise.all([
    db
      .select()
      .from(ecotrackOrderMajEntries)
      .where(eq(ecotrackOrderMajEntries.orderId, row.order.id))
      .orderBy(desc(ecotrackOrderMajEntries.remoteCreatedAt), desc(ecotrackOrderMajEntries.id)),
    db
      .select()
      .from(ecotrackOrderTrackingEvents)
      .where(eq(ecotrackOrderTrackingEvents.orderId, row.order.id))
      .orderBy(
        desc(ecotrackOrderTrackingEvents.eventDate),
        desc(ecotrackOrderTrackingEvents.eventTime),
        desc(ecotrackOrderTrackingEvents.id),
      ),
  ]);

  return {
    ...toListItem(row, record, stateNameById),
    majEntries: majRows.map((entry) => ({
      id: entry.id,
      remarque: entry.remarque,
      station: entry.station,
      livreur: entry.livreur,
      remoteCreatedAt: entry.remoteCreatedAt.toISOString(),
    })),
    trackingEvents: trackingRows.map((entry) => ({
      id: entry.id,
      eventDate: entry.eventDate,
      eventTime: entry.eventTime,
      status: entry.status,
      scanLocation: entry.scanLocation,
    })),
  };
}

export function buildUpdatePayload(
  record: OrderRecord,
  trackingNumber: string,
  catalog: Parameters<typeof buildEcotrackOrderPayload>[1],
) {
  const payload = buildEcotrackOrderPayload(record, catalog);

  return {
    tracking: trackingNumber,
    reference: payload.reference,
    client: payload.nom_client,
    tel: payload.telephone,
    tel2: payload.telephone_2 ?? undefined,
    adresse: payload.adresse,
    code_postal: payload.code_postal ?? undefined,
    commune: payload.commune,
    wilaya: payload.code_wilaya ? Number(payload.code_wilaya) : undefined,
    montant: payload.montant,
    remarque: payload.remarque ?? undefined,
    product: payload.produit ?? undefined,
    boutique: 'Bricomaitre',
    type: 1,
    stop_desk: payload.stop_desk,
    fragile: 0,
    gps_link: 'https://www.google.com/maps',
  };
}

export function parseEcotrackShipmentUpdateDraft(input: unknown) {
  return ecotrackShipmentUpdateDraftSchema.parse(input);
}

export function parseEcotrackMajCreateRequest(input: unknown) {
  return ecotrackMajCreateRequestSchema.parse(input);
}

export function parseEcotrackDispatchRequest(input: unknown) {
  return ecotrackDispatchRequestSchema.parse(input);
}

export function parseEcotrackBulkAction(input: unknown) {
  return ecotrackBulkActionSchema.parse(input);
}

export function parseEcotrackBulkDispatchRequest(input: unknown) {
  return ecotrackBulkDispatchRequestSchema.parse(input);
}

function parseEcotrackShipmentListQuery(input: EcotrackShipmentListQueryInput) {
  return ecotrackShipmentListQuerySchema.parse(input);
}

export async function loadEcotrackOrdersPageData(
  input: EcotrackShipmentListQueryInput,
  writable: boolean,
  options: EcotrackListLoadOptions = {},
): Promise<EcotrackOrderListResponse> {
  if (!hasDb()) {
    return {
      writable: false,
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  const db = getDb();
  const query = parseEcotrackShipmentListQuery(input);
  const [rows, catalog] = await Promise.all([loadActiveShipmentRows(db), readEcotrackCatalog(db)]);
  const stateNameById = new Map(catalog.wilayas.map((entry) => [entry.wilayaId, entry.name]));
  const productLookup = await getOrderProductLookup(
    db,
    rows.map((row) => row.order),
  );
  const entries = buildListItems(rows, productLookup, stateNameById);

  if (options.ensureFreshVisiblePage) {
    const initialPage = applyListQuery(entries, query);
    const staleVisibleIds = initialPage.pageItems
      .filter(
        (item) =>
          item.status.isStatusStale || item.status.isTrackingStale || item.status.isMajStale,
      )
      .map((item) => item.orderId);

    if (staleVisibleIds.length > 0) {
      await refreshEcotrackOrdersBatch(staleVisibleIds, options.actor);
      const refreshedRows = await loadActiveShipmentRows(db);
      const refreshedProductLookup = await getOrderProductLookup(
        db,
        refreshedRows.map((row) => row.order),
      );
      const refreshedEntries = buildListItems(refreshedRows, refreshedProductLookup, stateNameById);
      const { pageItems, pagination } = applyListQuery(refreshedEntries, query);
      return {
        writable,
        items: pageItems,
        pagination,
      };
    }
  }

  const { pageItems, pagination } = applyListQuery(entries, query);
  return {
    writable,
    items: pageItems,
    pagination,
  };
}

export async function loadEcotrackOrderDetail(
  orderId: number,
  actor?: ActionActor | null,
): Promise<EcotrackOrderDetail | null> {
  if (!hasDb()) {
    return null;
  }

  const db = getDb();
  const initialRow = await loadShipmentRowByOrderId(db, orderId);
  if (!initialRow) {
    return null;
  }

  let freshDetail: EcotrackOrderDetail | null;
  try {
    freshDetail = await ensureFreshShipmentRow(db, initialRow, { actor });
  } catch (error) {
    throw new Error(formatEcotrackActionError('detail', initialRow, error).summary);
  }
  if (!freshDetail) {
    return null;
  }

  const row = await loadShipmentRowByOrderId(db, orderId);
  return row ? buildEcotrackOrderDetailFromRow(db, row) : null;
}

export async function refreshEcotrackOrder(orderId: number, actor?: ActionActor | null) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  return refreshShipmentRow(db, row, { actor });
}

export async function refreshEcotrackOrdersBatch(
  orderIds: number[],
  actor?: ActionActor | null,
): Promise<EcotrackRefreshBatchResult> {
  const db = getDb();
  const rows = (
    await Promise.all(orderIds.map((orderId) => loadShipmentRowByOrderId(db, orderId)))
  ).filter(Boolean) as ShipmentRow[];
  const refreshed: EcotrackOrderDetail[] = [];
  const failures: EcotrackRefreshFailure[] = [];

  const batches: ShipmentRow[][] = [];
  for (const provider of ['delivro', 'emir'] as const) {
    const providerRows = rows.filter(
      (row) => (row.provider === 'emir' ? 'emir' : 'delivro') === provider,
    );
    for (let index = 0; index < providerRows.length; index += 100) {
      batches.push(providerRows.slice(index, index + 100));
    }
  }

  for (const batch of batches) {
    const trackingNumbers = batch.map((row) => row.trackingNumber);
    let statusResponse: Awaited<ReturnType<typeof getEcotrackOrdersStatus>>;
    let trackingResponse: Awaited<ReturnType<typeof getEcotrackTrackingsInfoAllowingMissing>>;

    try {
      [statusResponse, trackingResponse] = await Promise.all([
        batch[0].provider === 'emir'
          ? getEcotrackOrdersStatus(trackingNumbers, 'all', providerRequestOptions(batch[0]))
          : getEcotrackOrdersStatus(trackingNumbers, 'all'),
        batch[0].provider === 'emir'
          ? getEcotrackTrackingsInfoAllowingMissing(
              trackingNumbers,
              providerRequestOptions(batch[0]),
            )
          : getEcotrackTrackingsInfoAllowingMissing(trackingNumbers),
      ]);
    } catch (error) {
      failures.push(...batch.map((row) => toEcotrackFailureRecord('refresh', row, error)));
      continue;
    }

    for (const row of batch) {
      try {
        if (trackingResponse.missing.has(row.trackingNumber)) {
          await softDeleteShipmentRow(db, row, { actor, operation: 'delete' });
          continue;
        }

        const majResponse = await getEcotrackMaj(row.trackingNumber, providerRequestOptions(row));
        await upsertShipmentState(
          db,
          row,
          {
            statusItem: statusResponse.data.get(row.trackingNumber) ?? null,
            trackingInfo: trackingResponse.data.get(row.trackingNumber) ?? null,
            majEntries: majResponse.data,
          },
          actor,
        );
        const detail = await loadEcotrackOrderDetail(row.order.id);
        if (detail) {
          refreshed.push(detail);
        }
      } catch (error) {
        failures.push(toEcotrackFailureRecord('refresh', row, error));
      }
    }
  }

  const successCount = Math.max(0, rows.length - failures.length);

  return {
    ok: successCount > 0 || rows.length === 0,
    items: refreshed,
    failures,
    successCount,
    failureCount: failures.length,
    totalRequested: orderIds.length,
  };
}

export async function updatePostedEcotrackOrder(
  orderId: number,
  draft: EcotrackOrderUpdateDraft,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, {
      includeMaj: false,
      includeTracking: false,
      actor,
    });
  } catch (error) {
    throw new Error(formatEcotrackActionError('update', row, error).summary);
  }
  if (!fresh?.canEdit) {
    throw new Error(
      formatEcotrackActionError(
        'update',
        row,
        new Error('This ECOTRACK order can no longer be modified.'),
      ).summary,
    );
  }

  const previous = {
    firstName: row.order.firstName,
    lastName: row.order.lastName,
    phoneNumber1: row.order.phoneNumber1,
    phoneNumber2: row.order.phoneNumber2,
    delivery: row.order.delivery,
    state: row.order.state,
    city: row.order.city,
    homeAddress: row.order.homeAddress,
    note: row.order.note,
    cartProducts: row.order.cartProducts,
    delPr: row.order.delPr,
    price: row.order.price,
  };

  const catalog = await readEcotrackCatalog(db);
  const now = new Date();
  const nextDeliveryFeeValue =
    draft.deliveryFee === null
      ? (row.order.delPr ?? '0.00')
      : String(Number(draft.deliveryFee).toFixed(2));
  const nextCartProducts =
    draft.cartProducts === undefined
      ? row.order.cartProducts
      : await canonicalizeOrderCartProducts(db, draft.cartProducts);

  const [updatedOrder] = await db
    .update(orders)
    .set({
      firstName: draft.firstName,
      lastName: sanitizeNullableText(draft.lastName),
      phoneNumber1: draft.phoneNumber1,
      phoneNumber2: sanitizeNullableText(draft.phoneNumber2),
      delivery: draft.delivery,
      state: draft.state,
      city: draft.city,
      homeAddress: sanitizeNullableText(draft.homeAddress),
      note: sanitizeNullableText(draft.note),
      cartProducts: nextCartProducts,
      delPr: nextDeliveryFeeValue,
      price:
        draft.subtotalOverride === null ? null : String(Number(draft.subtotalOverride).toFixed(2)),
      updatedAt: now,
    })
    .where(eq(orders.id, orderId))
    .returning();

  try {
    const productLookup = await getOrderProductLookup(db, [updatedOrder]);
    const updatedRecord = toOrderRecord(updatedOrder, [], productLookup);
    await updateEcotrackOrder(
      buildUpdatePayload(updatedRecord, row.trackingNumber, catalog),
      providerRequestOptions(row),
    );
  } catch (error) {
    await db
      .update(orders)
      .set({
        ...previous,
        updatedAt: row.order.updatedAt,
      })
      .where(eq(orders.id, orderId));
    throw new Error(formatEcotrackActionError('update', row, error).summary);
  }

  await db.transaction(async (tx) => {
    const beforeOrderState = buildEcotrackOrderActionSnapshot(updatedOrder);
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);

    await tx
      .update(ecotrackOrderStates)
      .set({
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));

    const afterShipmentState = {
      ...beforeShipmentState,
      lastActionAt: now,
      updatedAt: now,
    };

    await recordEcotrackOrderAction(
      tx,
      buildEcotrackOrderActionSnapshot(row.order),
      beforeOrderState,
      actor,
    );
    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function recreatePostedEcotrackOrder(
  orderId: number,
  draft: EcotrackOrderUpdateDraft,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, {
      includeMaj: false,
      includeTracking: false,
      actor,
    });
  } catch (error) {
    throw new Error(formatEcotrackActionError('recreate', row, error).summary);
  }

  if (!fresh) {
    return null;
  }

  if (fresh.canEdit) {
    throw new Error(
      formatEcotrackActionError(
        'recreate',
        row,
        new Error('This ECOTRACK order should be edited directly instead of recreated.'),
      ).summary,
    );
  }

  const previousOrderValues = {
    firstName: row.order.firstName,
    lastName: row.order.lastName,
    phoneNumber1: row.order.phoneNumber1,
    phoneNumber2: row.order.phoneNumber2,
    delivery: row.order.delivery,
    state: row.order.state,
    city: row.order.city,
    homeAddress: row.order.homeAddress,
    note: row.order.note,
    cartProducts: row.order.cartProducts,
    delPr: row.order.delPr,
    price: row.order.price,
    ecotrackStatus: row.order.ecotrackStatus,
    ecotrackStatusLastUpdate: row.order.ecotrackStatusLastUpdate,
    ecotrackStatusData: row.order.ecotrackStatusData,
    ecotrackReference: row.order.ecotrackReference,
    ecotrackTrackingNumber: row.order.ecotrackTrackingNumber,
    updatedAt: row.order.updatedAt,
  };
  const previousShipmentValues = {
    deletedAt: row.deletedAt,
    lastActionAt: row.lastActionAt,
    updatedAt: row.updatedAt,
  };

  const now = new Date();
  const nextCartProducts =
    draft.cartProducts === undefined
      ? row.order.cartProducts
      : await canonicalizeOrderCartProducts(db, draft.cartProducts);
  const [updatedOrder] = await db
    .update(orders)
    .set({
      firstName: draft.firstName,
      lastName: sanitizeNullableText(draft.lastName),
      phoneNumber1: draft.phoneNumber1,
      phoneNumber2: sanitizeNullableText(draft.phoneNumber2),
      delivery: draft.delivery,
      state: draft.state,
      city: draft.city,
      homeAddress: sanitizeNullableText(draft.homeAddress),
      note: sanitizeNullableText(draft.note),
      cartProducts: nextCartProducts,
      delPr:
        draft.deliveryFee === null
          ? (row.order.delPr ?? '0.00')
          : String(Number(draft.deliveryFee).toFixed(2)),
      price:
        draft.subtotalOverride === null ? null : String(Number(draft.subtotalOverride).toFixed(2)),
      updatedAt: now,
    })
    .where(eq(orders.id, orderId))
    .returning();

  let recreated = false;

  try {
    await softDeleteShipmentRow(db, row, { actor, operation: 'update' });

    const catalog = await readEcotrackCatalog(db);
    const productLookup = await getOrderProductLookup(db, [updatedOrder]);
    const updatedRecord = toOrderRecord(updatedOrder, [], productLookup);
    const payload = buildEcotrackOrderPayload(updatedRecord, catalog);
    const createResponse = await createEcotrackOrdersBatch([payload], providerRequestOptions(row));
    const createResult = createResponse.results.get(payload.reference);

    if (!createResult?.success || !createResult.tracking) {
      throw new Error(createResult?.message ?? 'Ecotrack rejected the recreated order.');
    }

    await persistEcotrackPostedOrder(
      db,
      {
        row: updatedOrder,
        record: updatedRecord,
      },
      actor,
      createResult,
      row.provider === 'emir' ? 'emir' : 'delivro',
    );
    recreated = true;
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx.update(orders).set(previousOrderValues).where(eq(orders.id, orderId));

      await tx
        .update(ecotrackOrderStates)
        .set(previousShipmentValues)
        .where(eq(ecotrackOrderStates.id, row.id));
    });

    throw new Error(formatEcotrackActionError('recreate', row, error).summary);
  }

  if (!recreated) {
    throw new Error(
      formatEcotrackActionError('recreate', row, new Error('Failed to recreate ECOTRACK shipment.'))
        .summary,
    );
  }

  return refreshEcotrackOrder(orderId, actor);
}

export async function deletePostedEcotrackOrder(
  orderId: number,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  if (isStaleAt(row.lastStatusSyncedAt, STATUS_STALE_MS)) {
    let fresh: EcotrackOrderDetail | null;
    try {
      fresh = await ensureFreshShipmentRow(db, row, {
        includeMaj: false,
        includeTracking: false,
        actor,
      });
    } catch (error) {
      throw new Error(formatEcotrackActionError('delete', row, error).summary);
    }
    if (!fresh) {
      return null;
    }
    if (!fresh.canDelete) {
      throw new Error(
        formatEcotrackActionError(
          'delete',
          row,
          new Error('This ECOTRACK order can no longer be deleted.'),
        ).summary,
      );
    }
  } else if (!getActionFlags(row.currentStatus, row.deletedAt).canDelete) {
    throw new Error(
      formatEcotrackActionError(
        'delete',
        row,
        new Error('This ECOTRACK order can no longer be deleted.'),
      ).summary,
    );
  }

  try {
    if (row.provider === 'emir') {
      await deleteEcotrackOrder(row.trackingNumber, providerRequestOptions(row));
    } else {
      await deleteEcotrackOrder(row.trackingNumber);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes(' 400 ') && !message.includes(' 404 ')) {
      throw new Error(formatEcotrackActionError('delete', row, error).summary);
    }

    const [statusResponse, trackingResponse] = await Promise.all([
      row.provider === 'emir'
        ? getEcotrackOrdersStatus([row.trackingNumber], 'all', providerRequestOptions(row))
        : getEcotrackOrdersStatus([row.trackingNumber], 'all'),
      row.provider === 'emir'
        ? getEcotrackTrackingsInfoAllowingMissing([row.trackingNumber], providerRequestOptions(row))
        : getEcotrackTrackingsInfoAllowingMissing([row.trackingNumber]),
    ]);

    if (
      statusResponse.data.has(row.trackingNumber) ||
      trackingResponse.data.has(row.trackingNumber)
    ) {
      throw new Error(formatEcotrackActionError('delete', row, error).summary);
    }
  }

  await softDeleteShipmentRow(db, row, { actor, operation: 'delete' });

  return { ok: true };
}

export async function dispatchPostedEcotrackOrder(
  orderId: number,
  request: EcotrackDispatchRequest,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, {
      includeMaj: false,
      includeTracking: false,
      actor,
    });
  } catch (error) {
    throw new Error(formatEcotrackActionError('dispatch', row, error).summary);
  }
  if (!fresh?.canDispatch) {
    throw new Error(
      formatEcotrackActionError(
        'dispatch',
        row,
        new Error('This ECOTRACK order can no longer be dispatched.'),
      ).summary,
    );
  }

  try {
    await dispatchEcotrackOrder(
      row.trackingNumber,
      request.askCollection,
      providerRequestOptions(row),
    );
  } catch (error) {
    throw new Error(formatEcotrackActionError('dispatch', row, error).summary);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(ecotrackOrderStates)
      .set({
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));
    await tx
      .update(orders)
      .set({
        confirmed: 3,
        noAnswerCount: 0,
        updatedAt: now,
      })
      .where(eq(orders.id, orderId));
    await tx.insert(orderStatusHistory).values({
      orderId,
      status: 3,
      noAnswerCount: 0,
      changedBy: actor.email ?? null,
      changedByName: actor.name ?? null,
      changedAt: now,
    });
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function dispatchEcotrackOrdersBatch(
  orderIds: number[],
  request: EcotrackDispatchRequest,
  actor: { email?: string | null; name?: string | null },
): Promise<EcotrackDispatchBatchResult> {
  const items: EcotrackOrderDetail[] = [];
  const failures: EcotrackBulkActionFailure[] = [];

  for (const orderId of orderIds) {
    const row = await loadShipmentRowByOrderId(getDb(), orderId);
    if (!row) {
      failures.push({
        orderId,
        reference: null,
        trackingNumber: null,
        message: `Order #${orderId}: Ecotrack shipment not found.`,
      });
      continue;
    }

    try {
      const item = await dispatchPostedEcotrackOrder(orderId, request, actor);
      if (item) {
        items.push(item);
      } else {
        failures.push({
          orderId,
          reference: row.reference,
          trackingNumber: row.trackingNumber,
          message: `Order #${orderId} / Ref ${row.reference} / Tracking ${row.trackingNumber}: Ecotrack shipment not found.`,
        });
      }
    } catch (error) {
      failures.push(toEcotrackFailureRecord('dispatch', row, error));
    }
  }

  const successCount = items.length;
  return {
    ok: successCount > 0 || orderIds.length === 0,
    items,
    failures,
    successCount,
    failureCount: failures.length,
    totalRequested: orderIds.length,
  };
}

export async function addEcotrackMaj(
  orderId: number,
  content: string,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, { includeTracking: false, actor });
  } catch (error) {
    throw new Error(formatEcotrackActionError('maj', row, error).summary);
  }
  if (!fresh?.canAddMaj) {
    throw new Error(
      formatEcotrackActionError(
        'maj',
        row,
        new Error('This ECOTRACK order cannot receive a follow-up update right now.'),
      ).summary,
    );
  }

  try {
    await addEcotrackMajUpstream(row.trackingNumber, content, providerRequestOptions(row));
  } catch (error) {
    throw new Error(formatEcotrackActionError('maj', row, error).summary);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);
    const beforeMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);

    await tx
      .update(ecotrackOrderStates)
      .set({
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));

    const afterShipmentState = {
      ...beforeShipmentState,
      lastActionAt: now,
      updatedAt: now,
    };
    const afterMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);

    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
    await recordEcotrackMajAction(tx, row.order.id, beforeMajState, afterMajState, actor);
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function requestEcotrackReturn(
  orderId: number,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, { actor });
  } catch (error) {
    throw new Error(formatEcotrackActionError('return', row, error).summary);
  }
  if (!fresh?.canAskReturn) {
    throw new Error(
      formatEcotrackActionError(
        'return',
        row,
        new Error('Return can only be requested while the shipment is en_livraison.'),
      ).summary,
    );
  }

  try {
    await requestEcotrackReturnUpstream(row.trackingNumber, providerRequestOptions(row));
  } catch (error) {
    throw new Error(formatEcotrackActionError('return', row, error).summary);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);

    await tx
      .update(ecotrackOrderStates)
      .set({
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));

    const afterShipmentState = {
      ...beforeShipmentState,
      lastActionAt: now,
      updatedAt: now,
    };

    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function fetchSingleEcotrackLabel(orderId: number) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  try {
    return await fetchEcotrackOrderLabel(row.trackingNumber, providerRequestOptions(row));
  } catch (error) {
    throw new Error(formatEcotrackActionError('label', row, error).summary);
  }
}

export async function fetchMergedEcotrackLabels(
  orderIds: number[],
): Promise<EcotrackBulkLabelResult> {
  const db = getDb();
  const rows = (
    await Promise.all(orderIds.map((orderId) => loadShipmentRowByOrderId(db, orderId)))
  ).filter(Boolean) as ShipmentRow[];
  const merged = await PDFDocument.create();
  const items: EcotrackLabelItem[] = [];
  const failures: EcotrackBulkActionFailure[] = [];

  for (const orderId of orderIds) {
    if (!rows.some((row) => row.order.id === orderId)) {
      failures.push({
        orderId,
        reference: null,
        trackingNumber: null,
        message: `Order #${orderId}: Ecotrack shipment not found.`,
      });
    }
  }

  for (const row of rows) {
    try {
      const label = await fetchEcotrackOrderLabel(row.trackingNumber, providerRequestOptions(row));
      const source = await PDFDocument.load(label.body);
      const copiedPages = await merged.copyPages(source, source.getPageIndices());
      for (const page of copiedPages) {
        merged.addPage(page);
      }
      items.push({
        orderId: row.order.id,
        reference: row.reference,
        trackingNumber: row.trackingNumber,
      });
    } catch (error) {
      failures.push(toEcotrackFailureRecord('label', row, error));
    }
  }

  const successCount = items.length;
  const body = successCount > 0 ? await merged.save() : null;

  return {
    ok: successCount > 0 || orderIds.length === 0,
    items,
    failures,
    successCount,
    failureCount: failures.length,
    totalRequested: orderIds.length,
    fileName:
      successCount > 0 ? `ecotrack-labels-${new Date().toISOString().slice(0, 10)}.pdf` : null,
    pdfBase64: body ? Buffer.from(body).toString('base64') : null,
  };
}

export async function syncEcotrackShipmentStates(
  options: {
    includeMaj?: boolean;
    actor?: ActionActor | null;
  } = {},
) {
  const db = getDb();
  const rows = await loadActiveShipmentRows(db);
  const candidates = rows.filter(
    (row) =>
      !TERMINAL_STATUSES.has(row.currentStatus) ||
      isStaleAt(row.lastStatusSyncedAt, 7 * 24 * 60 * 60 * 1000),
  );

  const batches: ShipmentRow[][] = [];
  for (const provider of ['delivro', 'emir'] as const) {
    const providerRows = candidates.filter(
      (row) => (row.provider === 'emir' ? 'emir' : 'delivro') === provider,
    );
    for (let index = 0; index < providerRows.length; index += 100) {
      batches.push(providerRows.slice(index, index + 100));
    }
  }

  let synced = 0;
  let failed = 0;
  let batchFailed = 0;
  let majFailed = 0;
  for (const batch of batches) {
    const trackingNumbers = batch.map((row) => row.trackingNumber);
    let statusResponse: Awaited<ReturnType<typeof getEcotrackOrdersStatus>>;
    let trackingResponse: Awaited<ReturnType<typeof getEcotrackTrackingsInfo>>;
    try {
      [statusResponse, trackingResponse] = await Promise.all([
        getEcotrackOrdersStatus(trackingNumbers, 'all', providerRequestOptions(batch[0])),
        getEcotrackTrackingsInfo(trackingNumbers, providerRequestOptions(batch[0])),
      ]);
    } catch {
      failed += batch.length;
      batchFailed += batch.length;
      continue;
    }

    for (const row of batch) {
      let majEntries: UpstreamEcotrackMajEntry[] | null = null;
      // MAJ is a per-shipment endpoint subject to the provider's global request
      // pacing. A scheduled reconciliation can contain thousands of shipments,
      // so refreshing stale MAJ entries here would turn a 15-minute status job
      // into an hours-long serial crawl. Keep the periodic path bounded to the
      // batched status/tracking endpoints; explicit and visible-page refreshes
      // continue to request MAJ data through their on-demand paths.
      if (options.includeMaj === true) {
        try {
          majEntries = (await getEcotrackMaj(row.trackingNumber, providerRequestOptions(row))).data;
        } catch {
          // Status and tracking history remain useful when the optional MAJ feed
          // rejects one old or provider-incompatible tracking number.
          majFailed += 1;
        }
      }

      try {
        await upsertShipmentState(
          db,
          row,
          {
            statusItem: statusResponse.data.get(row.trackingNumber) ?? null,
            trackingInfo: trackingResponse.data.get(row.trackingNumber) ?? null,
            majEntries,
          },
          options.actor,
        );
        synced += 1;
      } catch {
        failed += 1;
      }
    }
  }

  if (candidates.length > 0 && synced === 0 && failed > 0) {
    throw new Error(`ECOTRACK shipment sync failed for all ${failed} candidates.`);
  }

  return { total: candidates.length, synced, failed, batchFailed, majFailed };
}
