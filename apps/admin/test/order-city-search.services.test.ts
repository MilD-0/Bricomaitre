import { getDb, getPool } from '@bric/db/client';
import { ecotrackCommunes, ecotrackOrderStates, ecotrackWilayas, orders } from '@bric/db/schema';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { queryAdminOrders } from '../lib/admin-ai-order-query';
import { loadActiveShipmentPageRows } from '../lib/admin-ecotrack-shipment-view';
import { loadOrdersPageData } from '../lib/admin-orders-data';
import { ecotrackShipmentListQuerySchema } from '../lib/ecotrack-shipment-list';

afterAll(async () => {
  await getPool().end();
});

it('searches commune names for numeric and legacy cities across orders, shipments and AI queries', async () => {
  const db = getDb();
  const marker = randomUUID();
  const communeName = `${marker} Ain Benian`;
  const wilayaIds = [16, 17];
  const communeId = 910521;
  const orderIds: number[] = [];
  const insertedWilayas = await db
    .insert(ecotrackWilayas)
    .values(wilayaIds.map((wilayaId) => ({ wilayaId, name: `Wilaya ${wilayaId}` })))
    .onConflictDoNothing()
    .returning({ id: ecotrackWilayas.wilayaId });
  try {
    await db.insert(ecotrackCommunes).values({
      communeId,
      wilayaId: wilayaIds[0]!,
      name: communeName,
    });
    const rows = await db
      .insert(orders)
      .values(
        [
          { city: String(communeId), state: wilayaIds[0] },
          { city: communeName, state: wilayaIds[0] },
          { city: ` ${communeId} `, state: wilayaIds[0] },
          { city: String(communeId), state: wilayaIds[1] },
          { city: '910522', state: wilayaIds[0] },
          { city: String(communeId), state: null },
          { city: null, state: wilayaIds[0] },
          { city: `Legacy ${marker}`, state: wilayaIds[1] },
        ].map((location) => ({ ...location, phoneNumber1: '0550123456' })),
      )
      .returning({ id: orders.id });
    orderIds.push(...rows.map((row) => row.id));
    await db.insert(ecotrackOrderStates).values(
      orderIds.map((id) => ({
        orderId: id,
        trackingNumber: `CITY-${id}`,
        reference: String(id),
        currentStatus: 'prete_a_expedier',
      })),
    );

    for (const [search, expectedIds] of [
      [`${marker} aIN bEN`, orderIds.slice(0, 3)],
      [`Legacy ${marker}`, [orderIds[7]!]],
      [`Missing ${marker}`, []],
    ] as const) {
      const expected = [...expectedIds].sort((a, b) => a - b);
      const page = await loadOrdersPageData({ search }, false);
      expect(page.items.map((row) => row.id).sort((a, b) => a - b)).toEqual(expected);
      expect(page.pagination.totalItems).toBe(expected.length);

      const shipments = await loadActiveShipmentPageRows(
        db,
        ecotrackShipmentListQuerySchema.parse({ search }),
      );
      expect(shipments.rows.map((row) => row.order.id).sort((a, b) => a - b)).toEqual(expected);
      expect(shipments.pagination.totalItems).toBe(expected.length);

      const ai = await queryAdminOrders({ search });
      expect(ai.kind).toBe('orders');
      if (ai.kind !== 'orders') throw new Error('Expected an order list');
      expect(ai.items.map((row) => row.id).sort((a, b) => a - b)).toEqual(expected);
      expect(ai.pagination.totalItems).toBe(expected.length);
    }
  } finally {
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds));
    await db.delete(ecotrackCommunes).where(inArray(ecotrackCommunes.communeId, [communeId]));
    if (insertedWilayas.length) {
      await db.delete(ecotrackWilayas).where(
        inArray(
          ecotrackWilayas.wilayaId,
          insertedWilayas.map((row) => row.id),
        ),
      );
    }
  }
});
