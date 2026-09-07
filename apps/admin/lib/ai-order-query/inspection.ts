import { getDb } from '@bric/db/client';
import { ecotrackOrderStates } from '@bric/db/schema';
import { parseNumericAmount } from '@bric/storefront-core/order-domain';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import { adminAiInHouseOrderStatus } from '../admin-ai-order-status';
import { loadOrderRecordsByIds } from '../admin-orders-data';
import { adminAiOrderInspectionSchema } from './contract';
import { iso } from './filters';

function storedShipment(row: typeof ecotrackOrderStates.$inferSelect | undefined) {
  if (!row) return null;
  return {
    state: row.deletedAt ? ('deleted' as const) : ('active' as const),
    provider: row.provider === 'emir' ? ('emir' as const) : ('delivro' as const),
    reference: row.reference,
    trackingNumber: row.trackingNumber,
    shipmentStatus: row.currentStatus,
    amountDzd: row.currentAmount === null ? null : parseNumericAmount(row.currentAmount),
    deliveryTariffDzd: row.deliveryTariff === null ? null : parseNumericAmount(row.deliveryTariff),
    returnTariffDzd: row.returnTariff === null ? null : parseNumericAmount(row.returnTariff),
    providerCreatedAt: iso(row.providerCreatedAt),
    providerUpdatedAt: iso(row.providerUpdatedAt),
    lastStatusSyncedAt: iso(row.lastStatusSyncedAt),
    deletedAt: iso(row.deletedAt),
  };
}

export async function inspectAdminOrderDetails(raw: z.input<typeof adminAiOrderInspectionSchema>) {
  const input = adminAiOrderInspectionSchema.parse(raw);
  const requestedIds = [...new Set(input.orderIds)];
  const db = getDb();
  const [loadedOrders, shipments] = await Promise.all([
    loadOrderRecordsByIds(requestedIds, db, { includeHistory: true }),
    db.query.ecotrackOrderStates.findMany({
      where: inArray(ecotrackOrderStates.orderId, requestedIds),
    }),
  ]);
  const shipmentByOrderId = new Map(
    shipments.flatMap((shipment) => (shipment ? [[shipment.orderId, shipment] as const] : [])),
  );

  const loadedIds = new Set(loadedOrders.map((order) => order.id));
  return {
    kind: 'order_details' as const,
    requestedIds,
    missingIds: requestedIds.filter((id) => !loadedIds.has(id)),
    items: loadedOrders.flatMap((item) => {
      if (!item) return [];
      const {
        inHouseStatus,
        statusHistory,
        ecotrackTrackingNumber: _ecotrackTrackingNumber,
        hasStatusHistory: _hasStatusHistory,
        ...order
      } = item;
      void _ecotrackTrackingNumber;
      void _hasStatusHistory;
      return [
        {
          ...order,
          inHouseStatus: adminAiInHouseOrderStatus(inHouseStatus, item.noAnswerCount),
          inHouseStatusHistory: statusHistory.map(({ status, ...entry }) => ({
            ...entry,
            inHouseStatus: adminAiInHouseOrderStatus(status, entry.noAnswerCount),
          })),
          ecotrackShipment: storedShipment(shipmentByOrderId.get(item.id)),
        },
      ];
    }),
  };
}
