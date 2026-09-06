import { getDb, getPool } from '@bric/db/client';
import { actionLogs, ecotrackOrderStates, orders } from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, expect, it, vi } from 'vitest';
import { loadEcotrackOrderDetail } from '../lib/admin-ecotrack-orders-read';
import { upsertShipmentState } from '../lib/admin-ecotrack-shipment-state';
import { loadShipmentRowByOrderId } from '../lib/admin-ecotrack-shipment-view';

afterAll(async () => {
  await getPool().end();
});

it('reads only changed feed summaries and hydrates fresh detail once while preserving feed audits', async () => {
  const db = getDb();
  const marker = randomUUID();
  const tracking = `READ-${marker}`;
  const [order] = await db
    .insert(orders)
    .values({
      firstName: 'Read cost',
      phoneNumber1: '0550123456',
      inHouseStatus: ORDER_STATUS.POSTED,
      ecotrackTrackingNumber: tracking,
    })
    .returning();
  const actor = { email: `${marker}@example.invalid` };
  const now = new Date();
  await db.insert(ecotrackOrderStates).values({
    orderId: order!.id,
    trackingNumber: tracking,
    reference: String(order!.id),
    currentStatus: 'prete_a_expedier',
    lastStatusSyncedAt: now,
    lastTrackingSyncedAt: now,
    lastMajSyncedAt: now,
  });
  const query = vi.spyOn(Client.prototype, 'query');
  const sqlQueries = () =>
    query.mock.calls.map((args) => {
      const config: unknown = args[0];
      return typeof config === 'string' ? config : (config as { text: string }).text;
    });
  try {
    const row = (await loadShipmentRowByOrderId(db, order!.id))!;
    query.mockClear();
    await upsertShipmentState(
      db,
      row,
      { statusItem: { status: 'en_livraison', activity: [] } },
      actor,
    );
    expect(
      sqlQueries().filter((sql) =>
        /from "admin"\."ecotrack_order_(maj_entries|tracking_events)"/.test(sql),
      ),
    ).toEqual([]);
    const payload = {
      majEntries: [{ tracking, remarque: 'Call recipient', created_at: now.toISOString() }],
      trackingInfo: {
        status: 'en_livraison',
        deliveryAttempts: [],
        activity: [
          {
            date: now.toISOString().slice(0, 10),
            time: '12:00:00',
            status: 'en_livraison',
            scanLocation: 'Alger',
          },
        ],
      },
    };
    await upsertShipmentState(db, (await loadShipmentRowByOrderId(db, order!.id))!, payload, actor);
    const logs = await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'ecotrackShipmentMajSync',
          afterState: expect.objectContaining({ entryCount: 1 }),
        }),
        expect.objectContaining({
          entityType: 'ecotrackShipmentTrackingSync',
          afterState: expect.objectContaining({ eventCount: 1 }),
        }),
      ]),
    );
    await upsertShipmentState(db, (await loadShipmentRowByOrderId(db, order!.id))!, payload, actor);
    expect(await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email))).toEqual(
      logs,
    );
    query.mockClear();
    const detail = await loadEcotrackOrderDetail(order!.id);
    expect(detail).toMatchObject({
      orderId: order!.id,
      trackingNumber: tracking,
      status: { currentStatus: 'en_livraison' },
      majEntries: [{ remarque: 'Call recipient' }],
      trackingEvents: [{ scanLocation: 'Alger' }],
    });
    for (const table of [
      'ecotrack_order_states',
      'ecotrack_order_maj_entries',
      'ecotrack_order_tracking_events',
    ]) {
      expect(sqlQueries().filter((sql) => sql.includes(`from "admin"."${table}"`))).toHaveLength(1);
    }
  } finally {
    query.mockRestore();
    await db.delete(orders).where(eq(orders.id, order!.id));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
  }
});
