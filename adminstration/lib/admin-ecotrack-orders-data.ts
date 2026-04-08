import { and, desc, eq, isNull, max, sql } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';

import {
  addEcotrackMaj as addEcotrackMajUpstream,
  readEcotrackActivityTimestamp,
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
} from '@bric/storefront-core';

import { getDb, hasDb } from '../db/client';
import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  orderStatusHistory,
  orders,
} from '../db/schema';
import { recordExplicitActionLog, type ActionActor } from './action-history';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import { buildEcotrackOrderPayload, readEcotrackCatalog, resolveEcotrackDeliveryFee } from './ecotrack';
import {
  coerceOrderStatus,
  isConfirmedLifecycleStatus,
  parseNumericAmount,
  type DeliveryType,
  type OrderProductSummary,
  type OrderRecord,
  type OrderStatus,
} from './orders';

const ecotrackShipmentSortKeySchema = z.enum(['createdAt', 'trackingNumber', 'clientName', 'currentStatus', 'lastStatusSyncedAt']);
const ecotrackShipmentSortDirectionSchema = z.enum(['asc', 'desc']);

const ecotrackShipmentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().trim().default(''),
  status: z.string().trim().default('all'),
  staleOnly: z.union([z.boolean(), z.string(), z.undefined()]).transform((value) => value === true || value === 'true').default(false),
  sortKey: ecotrackShipmentSortKeySchema.default('createdAt'),
  sortDirection: ecotrackShipmentSortDirectionSchema.default('desc'),
});

const ecotrackShipmentUpdateDraftSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).default(''),
  phoneNumber1: z.string().trim().min(1).max(50),
  phoneNumber2: z.string().trim().max(50).nullable().optional().default(null),
  delivery: z.union([z.literal(0), z.literal(1)]),
  state: z.number().int().min(1).max(58).nullable(),
  city: z.string().trim().min(1).max(120),
  homeAddress: z.string().trim().min(1).max(300),
  note: z.string().trim().max(500).nullable().optional().default(null),
  cartProducts: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
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

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type EcotrackShipmentListQuery = z.infer<typeof ecotrackShipmentListQuerySchema>;
export type EcotrackOrderUpdateDraft = z.infer<typeof ecotrackShipmentUpdateDraftSchema>;
export type EcotrackMajCreateRequest = z.infer<typeof ecotrackMajCreateRequestSchema>;
export type EcotrackDispatchRequest = z.infer<typeof ecotrackDispatchRequestSchema>;
export type EcotrackBulkLabelRequest = z.infer<typeof ecotrackBulkActionSchema>;

export type PaginationMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type EcotrackStatusSummary = {
  currentStatus: string;
  driverPhone: string | null;
  estimatedFee: number | null;
  deskPhone: string | null;
  deskCommune: string | null;
  deskMapLink: string | null;
  deskAddress: string | null;
  lastStatusSyncedAt: string | null;
  lastTrackingSyncedAt: string | null;
  lastMajSyncedAt: string | null;
  isStatusStale: boolean;
  isTrackingStale: boolean;
  isMajStale: boolean;
};

export type EcotrackMajEntry = {
  id: number;
  remarque: string;
  station: string | null;
  livreur: string | null;
  remoteCreatedAt: string;
};

export type EcotrackTrackingEvent = {
  id: number;
  eventDate: string;
  eventTime: string;
  status: string;
  scanLocation: string | null;
};

export type EcotrackOrderListItem = {
  orderId: number;
  reference: string;
  trackingNumber: string;
  createdAt: string;
  updatedAt: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  phoneNumber1: string;
  phoneNumber2: string | null;
  delivery: DeliveryType;
  deliveryLabel: 'home' | 'office';
  state: number | null;
  stateName: string | null;
  city: string | null;
  homeAddress: string | null;
  orderProducts: OrderProductSummary[];
  productSubtotal: number;
  deliveryFee: number;
  totalAmount: number;
  note: string | null;
  status: EcotrackStatusSummary;
  canEdit: boolean;
  canDelete: boolean;
  canDispatch: boolean;
  canAddMaj: boolean;
  canAskReturn: boolean;
  canPrintLabel: boolean;
};

export type EcotrackOrderDetail = EcotrackOrderListItem & {
  majEntries: EcotrackMajEntry[];
  trackingEvents: EcotrackTrackingEvent[];
};

export type EcotrackOrderListResponse = {
  items: EcotrackOrderListItem[];
  writable: boolean;
  pagination: PaginationMeta;
};

type ShipmentRow = typeof ecotrackOrderStates.$inferSelect & {
  order: typeof orders.$inferSelect;
};

const TERMINAL_STATUSES = new Set(['annule', 'paye_et_archive', 'retour_archive']);
const STATUS_STALE_MS = 15 * 60 * 1000;
const TRACKING_STALE_MS = 30 * 60 * 1000;
const MAJ_STALE_MS = 30 * 60 * 1000;
const FAILED_STATUS_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;
const ECOTRACK_SYNC_ACTOR_NAME = 'ECOTRACK sync';
const ECOTRACK_DISPATCHED_STATUSES = new Set(['en_ramassage', 'en_preparation_stock', 'en_preparation']);
const ECOTRACK_IN_DELIVERY_STATUSES = new Set(['en_livraison', 'en_hub', 'vers_wilaya', 'vers_hub']);
const ECOTRACK_COMPLETED_STATUSES = new Set(['livre_non_encaisse', 'encaisse_non_paye', 'paiements_prets', 'paye_et_archive']);
const ECOTRACK_RETURNED_STATUSES = new Set([
  'retour_chez_livreur',
  'retour_transit_entrepot',
  'retour_en_traitement',
  'retour_recu',
  'retour_archive',
]);

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

function buildShipmentActionSnapshot(row: typeof ecotrackOrderStates.$inferSelect | ShipmentRow) {
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
    firstName: row.firstName,
    lastName: row.lastName,
    phoneNumber1: row.phoneNumber1,
    phoneNumber2: row.phoneNumber2,
    delivery: row.delivery,
    state: row.state,
    city: row.city,
    homeAddress: row.homeAddress,
    note: row.note,
    cartProducts: row.cartProducts,
    delPr: row.delPr,
    updatedAt: row.updatedAt,
  };
}

async function loadMajSyncSummary(tx: Database | Transaction, orderId: number, trackingNumber: string) {
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

async function loadTrackingSyncSummary(tx: Database | Transaction, orderId: number, trackingNumber: string) {
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

async function recordEcotrackMajAction(
  tx: Transaction,
  orderId: number,
  beforeState: Awaited<ReturnType<typeof loadMajSyncSummary>>,
  afterState: Awaited<ReturnType<typeof loadMajSyncSummary>>,
  actor?: ActionActor | null,
) {
  if (areActionSnapshotsEqual(beforeState, afterState)) {
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
  if (areActionSnapshotsEqual(beforeState, afterState)) {
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

  return (Date.now() - value.getTime()) >= maxAgeMs;
}

function mapDeliveryLabel(delivery: DeliveryType) {
  return delivery === 1 ? 'office' : 'home';
}

function sanitizeNullableText(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed ? trimmed : null;
}

function getActionFlags(currentStatus: string, deletedAt: Date | null) {
  const isVisible = deletedAt === null;
  const isEditable = currentStatus === 'prete_a_expedier' && isVisible;
  return {
    canEdit: isEditable,
    canDelete: isEditable,
    canDispatch: isEditable,
    canAddMaj: isVisible && currentStatus !== 'prete_a_expedier' && !TERMINAL_STATUSES.has(currentStatus),
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
  return items.filter((item) =>
    item.trackingNumber.toLowerCase().includes(normalized)
    || item.fullName.toLowerCase().includes(normalized)
    || item.phoneNumber1.toLowerCase().includes(normalized)
    || (item.phoneNumber2?.toLowerCase().includes(normalized) ?? false)
    || (item.homeAddress?.toLowerCase().includes(normalized) ?? false)
    || (item.city?.toLowerCase().includes(normalized) ?? false)
    || (item.stateName?.toLowerCase().includes(normalized) ?? false)
    || String(item.state ?? '').includes(normalized)
    || item.status.currentStatus.toLowerCase().includes(normalized)
    || item.orderProducts.some((product) => product.title.toLowerCase().includes(normalized)));
}

function applySort(items: EcotrackOrderListItem[], query: EcotrackShipmentListQuery) {
  const direction = query.sortDirection === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    if (query.sortKey === 'trackingNumber') {
      return left.trackingNumber.localeCompare(right.trackingNumber) * direction;
    }

    if (query.sortKey === 'clientName') {
      return left.fullName.localeCompare(right.fullName) * direction;
    }

    if (query.sortKey === 'currentStatus') {
      return left.status.currentStatus.localeCompare(right.status.currentStatus) * direction;
    }

    if (query.sortKey === 'lastStatusSyncedAt') {
      const delta = getStatusTimestamp(new Date(left.status.lastStatusSyncedAt ?? 0)) - getStatusTimestamp(new Date(right.status.lastStatusSyncedAt ?? 0));
      return delta === 0 ? (right.orderId - left.orderId) * direction : delta * direction;
    }

    const delta = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    return delta === 0 ? (right.orderId - left.orderId) * direction : delta * direction;
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

async function loadShipmentRowByOrderId(db: Database, orderId: number) {
  const rows = await db
    .select({
      state: ecotrackOrderStates,
      order: orders,
    })
    .from(ecotrackOrderStates)
    .innerJoin(orders, eq(ecotrackOrderStates.orderId, orders.id))
    .where(and(eq(ecotrackOrderStates.orderId, orderId), isNull(ecotrackOrderStates.deletedAt), isNull(orders.archivedAt)))
    .limit(1);

  const row = rows[0];
  return row ? ({ ...row.state, order: row.order } as ShipmentRow) : undefined;
}

async function buildRecordsForRows(db: Database, rows: ShipmentRow[]) {
  const productLookup = await getOrderProductLookup(db, rows.map((row) => row.order));
  return rows.map((row) => ({
    row,
    record: toOrderRecord(row.order, [], productLookup),
  }));
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

function mapTrackingInfoEvents(orderId: number, trackingNumber: string, trackingInfo: EcotrackTrackingInfo) {
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

function isEcotrackRequestFailure(
  error: unknown,
  pathPrefix: string,
  status: number,
) {
  const message = error instanceof Error ? error.message : '';
  return message.includes(`ECOTRACK request failed for ${pathPrefix}`)
    && message.includes(`: ${status} `);
}

function isEcotrackMissingTrackingInfoError(error: unknown) {
  return isEcotrackRequestFailure(error, '/get/trackings/info', 404)
    || isEcotrackRequestFailure(error, '/get/tracking/info', 404);
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
  const beforeOrderState = buildOrderActionSnapshot(row.order);
  const beforeShipmentState = buildShipmentActionSnapshot(row);

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

async function getEcotrackTrackingsInfoAllowingMissing(trackings: string[]) {
  try {
    const response = await getEcotrackTrackingsInfo(trackings);
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

  if (latestUpstreamActivityAt && (Date.now() - latestUpstreamActivityAt.getTime()) >= FAILED_STATUS_MAX_AGE_MS) {
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
    const beforeOrderState = buildOrderActionSnapshot(row.order);
    const beforeShipmentState = buildShipmentActionSnapshot(row);
    const beforeMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);
    const beforeTrackingState = await loadTrackingSyncSummary(tx, row.order.id, row.trackingNumber);

    await tx
      .update(ecotrackOrderStates)
      .set(updates)
      .where(eq(ecotrackOrderStates.id, row.id));

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

      await tx
        .update(orders)
        .set(nextOrderValues)
        .where(eq(orders.id, row.order.id));

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
      const trackingValues = mapTrackingInfoEvents(row.order.id, row.trackingNumber, payload.trackingInfo);
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
            confirmedBy: isConfirmedLifecycleStatus(nextLocalStatus) ? row.order.confirmedBy ?? null : null,
            confirmedByName: isConfirmedLifecycleStatus(nextLocalStatus) ? row.order.confirmedByName ?? null : null,
            confirmedAt: isConfirmedLifecycleStatus(nextLocalStatus) ? row.order.confirmedAt ?? now : null,
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
    await recordEcotrackShipmentAction(tx, row.order.id, beforeShipmentState, afterShipmentState, actor, 'update');
    await recordEcotrackMajAction(tx, row.order.id, beforeMajState, afterMajState, actor);
    await recordEcotrackTrackingAction(tx, row.order.id, beforeTrackingState, afterTrackingState, actor);
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
    getEcotrackOrdersStatus([row.trackingNumber], 'all'),
    options.includeTracking === false ? Promise.resolve(null) : getEcotrackTrackingsInfoAllowingMissing([row.trackingNumber]),
    options.includeMaj === false ? Promise.resolve(null) : getEcotrackMaj(row.trackingNumber),
  ]);

  if (trackingResponse?.missing.has(row.trackingNumber)) {
    await softDeleteShipmentRow(db, row, { actor: options.actor, operation: 'delete' });
    return null;
  }

  await upsertShipmentState(db, row, {
    statusItem: statusResponse.data.get(row.trackingNumber) ?? null,
    trackingInfo: trackingResponse?.data.get(row.trackingNumber) ?? null,
    majEntries: majResponse?.data ?? null,
  }, options.actor);

  return loadEcotrackOrderDetail(row.order.id);
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
  const mustRefresh = isStaleAt(row.lastStatusSyncedAt, STATUS_STALE_MS)
    || (options.includeTracking !== false && isStaleAt(row.lastTrackingSyncedAt, TRACKING_STALE_MS))
    || (options.includeMaj !== false && isStaleAt(row.lastMajSyncedAt, MAJ_STALE_MS));

  if (!mustRefresh) {
    return loadEcotrackOrderDetail(row.order.id);
  }

  return refreshShipmentRow(db, row, options);
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

export function parseEcotrackShipmentListQuery(input: Record<string, string | number | boolean | undefined>) {
  return ecotrackShipmentListQuerySchema.parse(input);
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

export async function loadEcotrackOrdersPageData(
  input: Record<string, string | number | boolean | undefined>,
  writable: boolean,
): Promise<EcotrackOrderListResponse> {
  if (!hasDb()) {
    return {
      writable: false,
      items: [],
      pagination: { page: 1, limit: 25, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    };
  }

  const db = getDb();
  const query = parseEcotrackShipmentListQuery(input);
  const [rows, catalog] = await Promise.all([
    loadActiveShipmentRows(db),
    readEcotrackCatalog(db),
  ]);
  const withRecords = await buildRecordsForRows(db, rows);
  const stateNameById = new Map(catalog.wilayas.map((entry) => [entry.wilayaId, entry.name]));
  let items = withRecords.map(({ row, record }) => toListItem(row, record, stateNameById));

  if (query.status !== 'all') {
    items = items.filter((item) => item.status.currentStatus === query.status);
  }

  if (query.staleOnly) {
    items = items.filter((item) => item.status.isStatusStale || item.status.isTrackingStale || item.status.isMajStale);
  }

  items = applySearch(items, query.search);
  items = applySort(items, query);

  const { pageItems, pagination } = paginateItems(items, query.page, query.limit);
  return {
    writable,
    items: pageItems,
    pagination,
  };
}

export async function loadEcotrackOrderDetail(orderId: number): Promise<EcotrackOrderDetail | null> {
  if (!hasDb()) {
    return null;
  }

  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

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
      .where(eq(ecotrackOrderMajEntries.orderId, orderId))
      .orderBy(desc(ecotrackOrderMajEntries.remoteCreatedAt), desc(ecotrackOrderMajEntries.id)),
    db
      .select()
      .from(ecotrackOrderTrackingEvents)
      .where(eq(ecotrackOrderTrackingEvents.orderId, orderId))
      .orderBy(desc(ecotrackOrderTrackingEvents.eventDate), desc(ecotrackOrderTrackingEvents.eventTime), desc(ecotrackOrderTrackingEvents.id)),
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

export async function refreshEcotrackOrder(orderId: number, actor?: ActionActor | null) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  return refreshShipmentRow(db, row, { actor });
}

export async function refreshEcotrackOrdersBatch(orderIds: number[], actor?: ActionActor | null) {
  const db = getDb();
  const rows = (await Promise.all(orderIds.map((orderId) => loadShipmentRowByOrderId(db, orderId)))).filter(Boolean) as ShipmentRow[];
  const refreshed: EcotrackOrderDetail[] = [];

  const batches: ShipmentRow[][] = [];
  for (let index = 0; index < rows.length; index += 100) {
    batches.push(rows.slice(index, index + 100));
  }

  for (const batch of batches) {
    const trackingNumbers = batch.map((row) => row.trackingNumber);
    const [statusResponse, trackingResponse] = await Promise.all([
      getEcotrackOrdersStatus(trackingNumbers, 'all'),
      getEcotrackTrackingsInfoAllowingMissing(trackingNumbers),
    ]);

    for (const row of batch) {
      if (trackingResponse.missing.has(row.trackingNumber)) {
        await softDeleteShipmentRow(db, row, { actor, operation: 'delete' });
        continue;
      }

      const majResponse = await getEcotrackMaj(row.trackingNumber);
      await upsertShipmentState(db, row, {
        statusItem: statusResponse.data.get(row.trackingNumber) ?? null,
        trackingInfo: trackingResponse.data.get(row.trackingNumber) ?? null,
        majEntries: majResponse.data,
      }, actor);
      const detail = await loadEcotrackOrderDetail(row.order.id);
      if (detail) {
        refreshed.push(detail);
      }
    }
  }

  return refreshed;
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

  const fresh = await ensureFreshShipmentRow(db, row, { includeMaj: false, includeTracking: false, actor });
  if (!fresh?.canEdit) {
    throw new Error('This ECOTRACK order can no longer be modified.');
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
  };

  const catalog = await readEcotrackCatalog(db);
  const now = new Date();
  const nextDeliveryFee = draft.state === null
    ? row.order.delPr
    : resolveEcotrackDeliveryFee(catalog, draft.state, draft.delivery);
  const nextDeliveryFeeValue = nextDeliveryFee === null || Number.isNaN(Number(nextDeliveryFee))
    ? row.order.delPr
    : String(Number(nextDeliveryFee).toFixed(2));

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
      homeAddress: draft.homeAddress,
      note: sanitizeNullableText(draft.note),
      cartProducts: draft.cartProducts ?? row.order.cartProducts,
      delPr: nextDeliveryFeeValue,
      updatedAt: now,
    })
    .where(eq(orders.id, orderId))
    .returning();

  try {
    const productLookup = await getOrderProductLookup(db, [updatedOrder]);
    const updatedRecord = toOrderRecord(updatedOrder, [], productLookup);
    await updateEcotrackOrder(buildUpdatePayload(updatedRecord, row.trackingNumber, catalog));
  } catch (error) {
    await db
      .update(orders)
      .set({
        ...previous,
        updatedAt: row.order.updatedAt,
      })
      .where(eq(orders.id, orderId));
    throw error;
  }

  await db.transaction(async (tx) => {
    const beforeOrderState = buildOrderActionSnapshot(updatedOrder);
    const beforeShipmentState = buildShipmentActionSnapshot(row);

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

    await recordEcotrackOrderAction(tx, buildOrderActionSnapshot(row.order), beforeOrderState, actor);
    await recordEcotrackShipmentAction(tx, row.order.id, beforeShipmentState, afterShipmentState, actor, 'update');
  });

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
    const fresh = await ensureFreshShipmentRow(db, row, { includeMaj: false, includeTracking: false, actor });
    if (!fresh) {
      return null;
    }
    if (!fresh.canDelete) {
      throw new Error('This ECOTRACK order can no longer be deleted.');
    }
  } else if (!getActionFlags(row.currentStatus, row.deletedAt).canDelete) {
    throw new Error('This ECOTRACK order can no longer be deleted.');
  }

  try {
    await deleteEcotrackOrder(row.trackingNumber);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes(' 400 ') && !message.includes(' 404 ')) {
      throw error;
    }

    const [statusResponse, trackingResponse] = await Promise.all([
      getEcotrackOrdersStatus([row.trackingNumber], 'all'),
      getEcotrackTrackingsInfoAllowingMissing([row.trackingNumber]),
    ]);

    if (statusResponse.data.has(row.trackingNumber) || trackingResponse.data.has(row.trackingNumber)) {
      throw error;
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

  const fresh = await ensureFreshShipmentRow(db, row, { includeMaj: false, includeTracking: false, actor });
  if (!fresh?.canDispatch) {
    throw new Error('This ECOTRACK order can no longer be dispatched.');
  }

  await dispatchEcotrackOrder(row.trackingNumber, request.askCollection);
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

  const fresh = await ensureFreshShipmentRow(db, row, { includeTracking: false, actor });
  if (!fresh?.canAddMaj) {
    throw new Error('This ECOTRACK order cannot receive a follow-up update right now.');
  }

  await addEcotrackMajUpstream(row.trackingNumber, content);
  const now = new Date();
  await db.transaction(async (tx) => {
    const beforeShipmentState = buildShipmentActionSnapshot(row);
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

    await recordEcotrackShipmentAction(tx, row.order.id, beforeShipmentState, afterShipmentState, actor, 'update');
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

  const fresh = await ensureFreshShipmentRow(db, row, { actor });
  if (!fresh?.canAskReturn) {
    throw new Error('Return can only be requested while the shipment is en_livraison.');
  }

  await requestEcotrackReturnUpstream(row.trackingNumber);
  const now = new Date();
  await db.transaction(async (tx) => {
    const beforeShipmentState = buildShipmentActionSnapshot(row);

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

    await recordEcotrackShipmentAction(tx, row.order.id, beforeShipmentState, afterShipmentState, actor, 'update');
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function fetchSingleEcotrackLabel(orderId: number) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  return fetchEcotrackOrderLabel(row.trackingNumber);
}

export async function fetchMergedEcotrackLabels(orderIds: number[]) {
  const db = getDb();
  const rows = (await Promise.all(orderIds.map((orderId) => loadShipmentRowByOrderId(db, orderId)))).filter(Boolean) as ShipmentRow[];
  if (rows.length === 0) {
    throw new Error('No ECOTRACK labels were selected.');
  }

  const merged = await PDFDocument.create();
  for (const row of rows) {
    const label = await fetchEcotrackOrderLabel(row.trackingNumber);
    const source = await PDFDocument.load(label.body);
    const copiedPages = await merged.copyPages(source, source.getPageIndices());
    for (const page of copiedPages) {
      merged.addPage(page);
    }
  }

  return {
    body: await merged.save(),
    contentType: 'application/pdf',
    fileName: `ecotrack-labels-${new Date().toISOString().slice(0, 10)}.pdf`,
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
  const candidates = rows.filter((row) =>
    !TERMINAL_STATUSES.has(row.currentStatus)
      || isStaleAt(row.lastStatusSyncedAt, 7 * 24 * 60 * 60 * 1000));

  const batches: ShipmentRow[][] = [];
  for (let index = 0; index < candidates.length; index += 100) {
    batches.push(candidates.slice(index, index + 100));
  }

  let synced = 0;
  for (const batch of batches) {
    const trackingNumbers = batch.map((row) => row.trackingNumber);
    const [statusResponse, trackingResponse] = await Promise.all([
      getEcotrackOrdersStatus(trackingNumbers, 'all'),
      getEcotrackTrackingsInfo(trackingNumbers),
    ]);

    for (const row of batch) {
      const majEntries = options.includeMaj || isStaleAt(row.lastMajSyncedAt, MAJ_STALE_MS)
        ? (await getEcotrackMaj(row.trackingNumber)).data
        : null;
      await upsertShipmentState(db, row, {
        statusItem: statusResponse.data.get(row.trackingNumber) ?? null,
        trackingInfo: trackingResponse.data.get(row.trackingNumber) ?? null,
        majEntries,
      }, options.actor);
      synced += 1;
    }
  }

  return { total: candidates.length, synced };
}
