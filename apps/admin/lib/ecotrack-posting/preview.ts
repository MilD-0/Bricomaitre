import { orders, orderStatusHistory } from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  readEcotrackCatalog,
  resolveEcotrackCommune,
  type EcotrackCatalogRecord,
} from '../ecotrack-catalog';
import {
  normalizeEcotrackPhone,
  normalizeEcotrackText,
  readEcotrackMessage,
  readEcotrackSuccess,
  requestEcotrack,
} from '../ecotrack-provider';
import { getOrderProductLookup, toOrderRecord } from '../order-records';
import { coerceOrderStatus, type OrderRecord, type OrderStatusHistoryRecord } from '../orders';
import {
  ECOTRACK_PLACEHOLDER_ADDRESS,
  type Database,
  type EcotrackOrderInput,
  type EcotrackOrderInvalidItem,
  type EcotrackOrderPayload,
  type EcotrackOrderPreviewItem,
  type EcotrackOrderSkipItem,
  type EcotrackPreviewResult,
} from './contract';

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

export async function buildEcotrackPostingPreview(
  db: Database,
  mode: 'selected' | 'confirmed',
  orderIds: number[],
) {
  const items = await loadEcotrackOrderInputs(db, mode, orderIds);
  const catalog = await readEcotrackCatalog(db);
  return classifyOrdersForEcotrackPosting(items, catalog);
}
