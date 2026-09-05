import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';

import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  ecotrackWilayas,
  orders,
  products,
} from '@bric/db/schema';
import type {
  EcotrackShipmentDetail,
  EcotrackShipmentListItem,
  EcotrackStatusSummary,
} from './ecotrack-admin-contracts';
import {
  MAJ_STALE_MS,
  STATUS_STALE_MS,
  TERMINAL_STATUSES,
  TRACKING_STALE_MS,
} from './ecotrack-shipment-policy';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import { readEcotrackCatalog } from './ecotrack';
import type { EcotrackShipmentListQuery } from './ecotrack-shipment-list';
import { sanitizeNullableText } from './ecotrack-shipment-status';
import { orderProductSearchCondition } from './order-product-search';
import type {
  EcotrackDatabase as Database,
  EcotrackShipmentRow as ShipmentRow,
} from './ecotrack-shipment-types';
import { parseNumericAmount, type DeliveryType, type OrderRecord } from './orders';

type EcotrackOrderListItem = EcotrackShipmentListItem;
type EcotrackOrderDetail = EcotrackShipmentDetail;

function isoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function isStaleAt(value: Date | null | undefined, maxAgeMs: number) {
  if (!value) {
    return true;
  }

  return Date.now() - value.getTime() >= maxAgeMs;
}

function mapDeliveryLabel(delivery: DeliveryType) {
  return delivery === 1 ? 'office' : 'home';
}

function isMongoObjectId(value: string) {
  return /^[a-f\d]{24}$/i.test(value.trim());
}

export async function canonicalizeOrderCartProducts(db: Database, cartProducts: string[]) {
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

export function getActionFlags(currentStatus: string, deletedAt: Date | null) {
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

export async function loadActiveShipmentRows(
  db: Database,
  page?: { afterId: number; limit: number },
) {
  const query = db
    .select({
      state: ecotrackOrderStates,
      order: orders,
    })
    .from(ecotrackOrderStates)
    .innerJoin(orders, eq(ecotrackOrderStates.orderId, orders.id))
    .where(
      and(
        isNull(ecotrackOrderStates.deletedAt),
        page ? gt(ecotrackOrderStates.id, page.afterId) : undefined,
      ),
    );
  const rows = await (page
    ? query.orderBy(asc(ecotrackOrderStates.id)).limit(page.limit)
    : query.orderBy(desc(ecotrackOrderStates.updatedAt), desc(ecotrackOrderStates.id)));

  return rows.map((entry) => ({ ...entry.state, order: entry.order })) as ShipmentRow[];
}

function shipmentListOrderBy(query: EcotrackShipmentListQuery) {
  const values = query.sortRules.flatMap((rule) => {
    const direction = rule.direction === 'asc' ? asc : desc;
    if (rule.key === 'trackingNumber') return [direction(ecotrackOrderStates.trackingNumber)];
    if (rule.key === 'clientName')
      return [direction(sql`concat_ws(' ', ${orders.firstName}, ${orders.lastName})`)];
    if (rule.key === 'currentStatus') return [direction(ecotrackOrderStates.currentStatus)];
    if (rule.key === 'lastStatusSyncedAt')
      return [
        direction(sql`coalesce(${ecotrackOrderStates.lastStatusSyncedAt}, 'epoch'::timestamptz)`),
      ];
    return [direction(orders.createdAt)];
  });
  return [...values, desc(orders.id)];
}

export async function loadActiveShipmentPageRows(
  db: Database,
  query: EcotrackShipmentListQuery,
  now = new Date(),
) {
  const search = query.search ? `%${query.search}%` : null;
  const where = and(
    isNull(ecotrackOrderStates.deletedAt),
    query.status === 'all' ? undefined : eq(ecotrackOrderStates.currentStatus, query.status),
    query.staleOnly
      ? or(
          isNull(ecotrackOrderStates.lastStatusSyncedAt),
          lte(ecotrackOrderStates.lastStatusSyncedAt, new Date(now.getTime() - STATUS_STALE_MS)),
          isNull(ecotrackOrderStates.lastTrackingSyncedAt),
          lte(
            ecotrackOrderStates.lastTrackingSyncedAt,
            new Date(now.getTime() - TRACKING_STALE_MS),
          ),
          isNull(ecotrackOrderStates.lastMajSyncedAt),
          lte(ecotrackOrderStates.lastMajSyncedAt, new Date(now.getTime() - MAJ_STALE_MS)),
        )
      : undefined,
    search
      ? or(
          ilike(ecotrackOrderStates.trackingNumber, search),
          sql`concat_ws(' ', ${orders.firstName}, ${orders.lastName}) ILIKE ${search}`,
          ilike(orders.phoneNumber1, search),
          ilike(orders.phoneNumber2, search),
          ilike(orders.homeAddress, search),
          ilike(orders.city, search),
          ilike(ecotrackWilayas.name, search),
          sql`cast(${orders.state} as text) ILIKE ${search}`,
          ilike(ecotrackOrderStates.currentStatus, search),
          orderProductSearchCondition(query.search),
        )
      : undefined,
  );
  const [{ value: totalItems = 0 }] = await db
    .select({ value: count() })
    .from(ecotrackOrderStates)
    .innerJoin(orders, eq(ecotrackOrderStates.orderId, orders.id))
    .leftJoin(ecotrackWilayas, eq(ecotrackWilayas.wilayaId, orders.state))
    .where(where);
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const rows = await db
    .select({
      state: ecotrackOrderStates,
      order: orders,
    })
    .from(ecotrackOrderStates)
    .innerJoin(orders, eq(ecotrackOrderStates.orderId, orders.id))
    .leftJoin(ecotrackWilayas, eq(ecotrackWilayas.wilayaId, orders.state))
    .where(where)
    .orderBy(...shipmentListOrderBy(query))
    .limit(query.limit)
    .offset((page - 1) * query.limit);

  return {
    rows: rows.map((entry) => ({ ...entry.state, order: entry.order })) as ShipmentRow[],
    pagination: {
      page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export function buildListItems(
  rows: ShipmentRow[],
  productLookup: Awaited<ReturnType<typeof getOrderProductLookup>>,
  stateNameById: Map<number, string>,
) {
  return rows.map((row) =>
    toListItem(row, toOrderRecord(row.order, [], productLookup), stateNameById),
  );
}

export async function loadShipmentRowByOrderId(db: Database, orderId: number) {
  const rows = await db
    .select({
      state: ecotrackOrderStates,
      order: orders,
    })
    .from(ecotrackOrderStates)
    .innerJoin(orders, eq(ecotrackOrderStates.orderId, orders.id))
    .where(and(eq(ecotrackOrderStates.orderId, orderId), isNull(ecotrackOrderStates.deletedAt)))
    .limit(1);

  const row = rows[0];
  return row ? ({ ...row.state, order: row.order } as ShipmentRow) : undefined;
}

export async function buildEcotrackOrderDetailFromRow(
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
