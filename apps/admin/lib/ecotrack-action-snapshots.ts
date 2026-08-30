import { ecotrackOrderStates, orders } from '@bric/db/schema';

import { normalizeEcotrackMonetarySnapshotValue } from './ecotrack-monetary';

type OrderRow = typeof orders.$inferSelect;
type ShipmentRow = typeof ecotrackOrderStates.$inferSelect;
type OrderActionSource = Pick<
  OrderRow,
  | 'id'
  | 'inHouseStatus'
  | 'noAnswerCount'
  | 'confirmedBy'
  | 'confirmedByName'
  | 'confirmedAt'
  | 'ecotrackStatus'
  | 'ecotrackReference'
  | 'ecotrackTrackingNumber'
>;
type ShipmentActionSource = Pick<
  ShipmentRow,
  | 'id'
  | 'orderId'
  | 'reference'
  | 'trackingNumber'
  | 'provider'
  | 'currentStatus'
  | 'driverPhone'
  | 'estimatedFee'
  | 'deskPhone'
  | 'deskCommune'
  | 'deskMapLink'
  | 'deskAddress'
  | 'lastActionAt'
  | 'deletedAt'
>;

function serializeActionValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeActionValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeActionValue(entry),
      ]),
    );
  }
  return value;
}

export function areEcotrackActionSnapshotsEqual(left: unknown, right: unknown) {
  return JSON.stringify(serializeActionValue(left)) === JSON.stringify(serializeActionValue(right));
}

export function buildEcotrackOrderActionSnapshot(row: OrderActionSource) {
  return {
    id: row.id,
    inHouseStatus: row.inHouseStatus,
    noAnswerCount: row.noAnswerCount,
    confirmedBy: row.confirmedBy,
    confirmedByName: row.confirmedByName,
    confirmedAt: row.confirmedAt,
    ecotrackStatus: row.ecotrackStatus,
    ecotrackReference: row.ecotrackReference,
    ecotrackTrackingNumber: row.ecotrackTrackingNumber,
  };
}

export function buildEcotrackShipmentActionSnapshot(row: ShipmentActionSource) {
  return {
    id: row.id,
    orderId: row.orderId,
    reference: row.reference,
    trackingNumber: row.trackingNumber,
    provider: row.provider === 'emir' ? 'emir' : 'delivro',
    currentStatus: row.currentStatus,
    driverPhone: row.driverPhone,
    estimatedFee: normalizeEcotrackMonetarySnapshotValue(row.estimatedFee),
    deskPhone: row.deskPhone,
    deskCommune: row.deskCommune,
    deskMapLink: row.deskMapLink,
    deskAddress: row.deskAddress,
    lastActionAt: row.lastActionAt,
    deletedAt: row.deletedAt,
  };
}
