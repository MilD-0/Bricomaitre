import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  ecotrackMutations,
  ecotrackOrderActivities,
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderStatusObservations,
  ecotrackOrderTrackingEvents,
  orders,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  deletePostedEcotrackOrder,
  updatePostedEcotrackOrder,
} from '../lib/admin-ecotrack-orders-actions';
import { refreshEcotrackOrdersBatch } from '../lib/admin-ecotrack-orders-read';
import { applyAdminInventoryBatch } from '../lib/admin-inventory-workflow';
import {
  AdminOrderHasActiveEcotrackShipmentError,
  deleteAdminOrder,
} from '../lib/admin-order-lifecycle';
import { updateAdminOrder } from '../lib/admin-order-update';
import { EcotrackMutationConflictError } from '../lib/ecotrack-mutations';
import { recoverEcotrackMutation } from '../lib/ecotrack-recovery';
import { parseEcotrackShipmentUpdateDraft } from '../lib/ecotrack-shipment-input';

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
  it('keeps local commercial state unchanged while an upstream edit is pending or fails ambiguously', async () => {
    const db = getDb();
    const row = await createOrder({}, true);
    let rejectRequest!: (error: Error) => void;
    upstream.update.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );
    const draft = parseEcotrackShipmentUpdateDraft({
      firstName: 'New name',
      phoneNumber1: row.phoneNumber1,
      delivery: 0,
      state: 16,
      city: 'Alger',
      homeAddress: 'New address',
      subtotalOverride: 500,
    });
    const request = updatePostedEcotrackOrder(row.id, draft, actor);
    const failed = expect(request).rejects.toThrow('Connection lost');
    await vi.waitFor(() => expect(upstream.update).toHaveBeenCalledOnce());
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({
      firstName: 'Ada',
      homeAddress: 'Test street',
      price: null,
    });
    await expect(
      updateAdminOrder(db, row.id, { inHouseStatus: ORDER_STATUS.DISPATCHED }, actor),
    ).rejects.toBeInstanceOf(EcotrackMutationConflictError);
    await expect(updatePostedEcotrackOrder(row.id, draft, actor)).rejects.toBeInstanceOf(
      EcotrackMutationConflictError,
    );
    rejectRequest(new Error('Connection lost'));
    await failed;
    const [saved] = await db
      .select()
      .from(ecotrackMutations)
      .where(eq(ecotrackMutations.orderId, row.id));
    expect(saved).toMatchObject({
      state: 'uncertain',
      request: { desired: { values: { firstName: 'New name' } } },
    });
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]!.firstName).toBe('Ada');
    await db
      .update(ecotrackMutations)
      .set({ createdAt: new Date(Date.now() - 121_000) })
      .where(eq(ecotrackMutations.id, saved!.id));
    await recoverEcotrackMutation(
      {
        operationId: saved!.id,
        action: 'confirm_not_applied',
        evidence: 'Carrier confirms request was not applied.',
      },
      actor,
      db,
    );
    expect(
      (await db.select().from(ecotrackMutations).where(eq(ecotrackMutations.id, saved!.id)))[0]!
        .state,
    ).toBe('rejected');
    expect(upstream.update).toHaveBeenCalledOnce();
  });

  it('checks active shipments after acquiring the order deletion lock', async () => {
    const db = getDb();
    const row = await createOrder();
    let locked!: () => void;
    const acquired = new Promise<void>((resolve) => {
      locked = resolve;
    });
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const posting = db.transaction(async (tx) => {
      await tx.select().from(orders).where(eq(orders.id, row.id)).for('update');
      locked();
      await barrier;
      await tx.insert(ecotrackOrderStates).values({
        orderId: row.id,
        reference: String(row.id),
        trackingNumber: `RACE-${row.id}`,
        currentStatus: 'prete_a_expedier',
      });
    });
    await acquired;
    const deletion = expect(deleteAdminOrder(db, row.id, actor)).rejects.toBeInstanceOf(
      AdminOrderHasActiveEcotrackShipmentError,
    );
    release();
    await posting;
    await deletion;
    expect(await db.select().from(orders).where(eq(orders.id, row.id))).toHaveLength(1);
  });

  it('serializes reversed inventory batches and records barcode and order receipt provenance', async () => {
    const db = getDb();
    const rows = await db
      .insert(products)
      .values(
        [1, 2].map((index) => ({
          title: `Receipt ${index}`,
          slug: randomUUID(),
          price: '100',
          inventoryQuantity: 0,
        })),
      )
      .returning();
    productIds.push(...rows.map((row) => row.id));
    const result = await Promise.all([
      applyAdminInventoryBatch(
        db,
        {
          requestId: randomUUID(),
          mode: 'increase',
          items: rows.map((row) => ({
            productId: row.id,
            quantity: 1,
            source: { type: 'barcode-scan' as const },
          })),
        },
        actor,
      ),
      applyAdminInventoryBatch(
        db,
        {
          requestId: randomUUID(),
          mode: 'increase',
          items: [...rows].reverse().map((row) => ({
            productId: row.id,
            quantity: 2,
            source: { type: 'order-scan' as const, orderIds: [50] },
          })),
        },
        actor,
      ),
    ]);
    expect(result.every((value) => value.complete)).toBe(true);
    expect(
      (await db.select().from(products).where(inArray(products.id, productIds))).every(
        (row) => row.inventoryQuantity === 3,
      ),
    ).toBe(true);
    const audits = await db
      .select()
      .from(actionLogs)
      .where(and(eq(actionLogs.createdBy, actor.email), inArray(actionLogs.entityId, productIds)));
    expect(
      audits.map((entry) => (entry.afterState as Record<string, unknown>).inventoryReceiptSource),
    ).toEqual(
      expect.arrayContaining([{ type: 'barcode-scan' }, { type: 'order-scan', orderIds: [50] }]),
    );
    await db
      .delete(actionLogs)
      .where(and(eq(actionLogs.createdBy, actor.email), inArray(actionLogs.entityId, productIds)));
  });
  it('supports previous-runtime conflict clauses after the attempt-history migration', async () => {
    const db = getDb();
    const row = await createOrder();
    const now = new Date();
    for (let repeat = 0; repeat < 2; repeat++) {
      await db
        .insert(ecotrackOrderStatusObservations)
        .values({
          orderId: row.id,
          trackingNumber: 'LEGACY',
          status: 'prete_a_expedier',
          sourceKey: 'legacy-status',
          firstObservedAt: now,
          lastObservedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            ecotrackOrderStatusObservations.orderId,
            ecotrackOrderStatusObservations.sourceKey,
          ],
          set: { lastObservedAt: now },
        });
      await db
        .insert(ecotrackOrderActivities)
        .values({
          orderId: row.id,
          trackingNumber: 'LEGACY',
          sourceKey: 'legacy-activity',
          firstObservedAt: now,
          lastObservedAt: now,
        })
        .onConflictDoUpdate({
          target: [ecotrackOrderActivities.orderId, ecotrackOrderActivities.sourceKey],
          set: { lastObservedAt: now },
        });
      for (const trackingNumber of ['ATTEMPT-A', 'ATTEMPT-B']) {
        await db
          .insert(ecotrackOrderMajEntries)
          .values({
            orderId: row.id,
            trackingNumber,
            remarque: 'Identical message',
            remoteCreatedAt: now,
            raw: {},
          })
          .onConflictDoNothing();
        await db
          .insert(ecotrackOrderTrackingEvents)
          .values({
            orderId: row.id,
            trackingNumber,
            eventDate: '2026-01-01',
            eventTime: '12:00',
            status: 'attempt_delivery',
            raw: {},
          })
          .onConflictDoNothing();
      }
    }
    expect(
      await db
        .select()
        .from(ecotrackOrderStatusObservations)
        .where(eq(ecotrackOrderStatusObservations.orderId, row.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(ecotrackOrderActivities)
        .where(eq(ecotrackOrderActivities.orderId, row.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(ecotrackOrderMajEntries)
        .where(eq(ecotrackOrderMajEntries.orderId, row.id)),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(ecotrackOrderTrackingEvents)
        .where(eq(ecotrackOrderTrackingEvents.orderId, row.id)),
    ).toHaveLength(2);
  });

  it('persists positive carrier status despite tracking 404 and optional MAJ failure', async () => {
    const db = getDb();
    const row = await createOrder({}, true);
    const tracking = `TRACK-${row.id}`;
    upstream.status.mockResolvedValueOnce({
      data: new Map([[tracking, { status: 'en_livraison', activity: [] }]]),
    });
    upstream.trackings.mockRejectedValueOnce(
      new Error('ECOTRACK request failed for /get/trackings/info: 404 Not Found'),
    );
    upstream.maj.mockRejectedValueOnce(new Error('MAJ unavailable'));
    const result = await refreshEcotrackOrdersBatch([row.id]);
    expect(result).toMatchObject({ successCount: 1, failureCount: 0 });
    const [saved] = await db.select().from(orders).where(eq(orders.id, row.id));
    const [shipment] = await db
      .select()
      .from(ecotrackOrderStates)
      .where(eq(ecotrackOrderStates.orderId, row.id));
    expect(saved).toMatchObject({
      ecotrackTrackingNumber: tracking,
      inHouseStatus: ORDER_STATUS.IN_DELIVERY,
    });
    expect(shipment).toMatchObject({
      trackingNumber: tracking,
      currentStatus: 'en_livraison',
      deletedAt: null,
    });
    expect(upstream.currentOrder).not.toHaveBeenCalled();
  });

  it('does not delete an order shipment after a failed absence-confirmation read', async () => {
    const db = getDb();
    const row = await createOrder({}, true);
    upstream.remove.mockRejectedValueOnce(
      new Error('ECOTRACK request failed for /delete/order: 400 Bad request'),
    );
    upstream.status.mockResolvedValueOnce({ data: new Map() });
    upstream.trackings.mockRejectedValueOnce(
      new Error('ECOTRACK request failed for /get/trackings/info: 404 Not Found'),
    );
    upstream.currentOrder.mockRejectedValueOnce(
      new Error('ECOTRACK rejected current-orders lookup'),
    );
    await expect(deletePostedEcotrackOrder(row.id, actor)).rejects.toThrow();
    const [saved] = await db.select().from(orders).where(eq(orders.id, row.id));
    const [shipment] = await db
      .select()
      .from(ecotrackOrderStates)
      .where(eq(ecotrackOrderStates.orderId, row.id));
    expect(saved?.ecotrackTrackingNumber).toBe(`TRACK-${row.id}`);
    expect(shipment?.deletedAt).toBeNull();
  });
});
