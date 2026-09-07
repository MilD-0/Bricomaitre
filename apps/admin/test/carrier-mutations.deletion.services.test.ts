import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  ecotrackMutations,
  ecotrackOrderStates,
  orders,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { deletePostedEcotrackOrder } from '../lib/admin-ecotrack-orders-actions';

const upstream = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  tracking: vi.fn(),
  status: vi.fn(async (trackings: string[]) => ({
    data: new Map(
      trackings.map((tracking) => [tracking, { status: 'prete_a_expedier', activity: [] }]),
    ),
  })),
  trackings: vi.fn(),
  currentOrder: vi.fn(),
  maj: vi.fn(),
}));
vi.mock('@bric/storefront-core/ecotrack-client', async (original) => ({
  ...(await original<typeof import('@bric/storefront-core/ecotrack-client')>()),
  updateEcotrackOrder: upstream.update,
  deleteEcotrackOrder: upstream.remove,
  getEcotrackTrackingInfo: upstream.tracking,
  getEcotrackOrdersStatus: upstream.status,
  getEcotrackTrackingsInfo: upstream.trackings,
  getEcotrackOrder: upstream.currentOrder,
  getEcotrackMaj: upstream.maj,
}));
vi.mock('../lib/server-cache', async (original) => ({
  ...(await original<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));
vi.mock('../lib/storefront-revalidate', () => ({ revalidateStorefrontProducts: vi.fn() }));
vi.mock('../lib/reporting-refresh-trigger', () => ({ triggerAdminReportingRefresh: vi.fn() }));

const actor = { email: `carrier-${randomUUID()}@example.invalid`, name: 'Carrier operator' };
const orderIds: number[] = [];
const productIds: number[] = [];
async function createOrder(values: Partial<typeof orders.$inferInsert> = {}, posted = false) {
  const db = getDb();
  const [row] = await db
    .insert(orders)
    .values({
      id: 7_000_000_000_000 + Math.floor(Math.random() * 1_000_000_000),
      firstName: 'Ada',
      phoneNumber1: '0550000011',
      state: 16,
      city: 'Alger',
      homeAddress: 'Test street',
      delivery: 0,
      cartProducts: [],
      productSubtotal: '1000',
      deliveryFee: '200',
      totalAmount: '1200',
      inHouseStatus: posted ? ORDER_STATUS.POSTED : ORDER_STATUS.CONFIRMED,
      ...values,
    })
    .returning();
  orderIds.push(row!.id);
  if (posted) {
    const tracking = `TRACK-${row!.id}`;
    await db
      .update(orders)
      .set({ ecotrackTrackingNumber: tracking, ecotrackReference: String(row!.id) })
      .where(eq(orders.id, row!.id));
    await db.insert(ecotrackOrderStates).values({
      orderId: row!.id,
      reference: String(row!.id),
      trackingNumber: tracking,
      provider: 'delivro',
      currentStatus: 'prete_a_expedier',
      lastStatusSyncedAt: new Date(),
      lastMajSyncedAt: new Date(),
      lastTrackingSyncedAt: new Date(),
    });
  }
  return (await db.select().from(orders).where(eq(orders.id, row!.id)))[0]!;
}
afterEach(async () => {
  const db = getDb();
  if (orderIds.length) {
    await db.delete(ecotrackMutations).where(inArray(ecotrackMutations.orderId, orderIds));
    await db.delete(actionLogs).where(inArray(actionLogs.entityId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds.splice(0)));
  }
  if (productIds.length)
    await db.delete(products).where(inArray(products.id, productIds.splice(0)));
  vi.clearAllMocks();
});
afterAll(async () => {
  await getPool().end();
});

describe('carrier mutation ownership and recovery', () => {
  it('records deletion when the provider returns an error but validated current-order absence confirms the shipment is gone', async () => {
    const db = getDb();
    const row = await createOrder({}, true);
    upstream.remove.mockRejectedValueOnce(
      new Error('ECOTRACK request failed for /delete/order: 400 {"message":"suppression ok"}'),
    );
    upstream.status.mockResolvedValueOnce({ data: new Map() });
    upstream.trackings.mockRejectedValueOnce(
      new Error(
        'ECOTRACK request failed for /get/trackings/info: 404 {"message":"Trackings non trouvés"}',
      ),
    );
    upstream.currentOrder.mockResolvedValueOnce({ data: null });
    await expect(deletePostedEcotrackOrder(row.id, actor)).resolves.toMatchObject({ ok: true });
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({
      ecotrackTrackingNumber: null,
      inHouseStatus: ORDER_STATUS.CONFIRMED,
    });
    expect(
      (await db.select().from(ecotrackMutations).where(eq(ecotrackMutations.orderId, row.id)))[0],
    ).toMatchObject({
      state: 'applied',
      response: { raw: { recoveredBy: 'status-and-current-orders-absence' } },
    });
  });
});
