import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  ecotrackMutations,
  ecotrackOrderStates,
  ecotrackOrderStatusObservations,
  orderLineItems,
  orders,
  productPromoCodes,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { OrderProductLookup, toOrderRecord } from '@bric/storefront-core/order-records';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  deletePostedEcotrackOrder,
  updatePostedEcotrackOrder,
} from '../lib/admin-ecotrack-orders-actions';
import { upsertShipmentState } from '../lib/admin-ecotrack-shipment-state';
import { loadShipmentRowByOrderId } from '../lib/admin-ecotrack-shipment-view';
import { updateAdminOrder } from '../lib/admin-order-update';
import { applySavedEcotrackMutation } from '../lib/ecotrack-mutation-apply';
import {
  claimEcotrackMutation,
  EcotrackMutationConflictError,
  markEcotrackMutationUncertain,
  recordEcotrackMutationResult,
} from '../lib/ecotrack-mutations';
import { recoverEcotrackMutation } from '../lib/ecotrack-recovery';
import { persistStatusEvidence } from '../lib/ecotrack-shipment-evidence';
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
function input(row: typeof orders.$inferSelect) {
  return { row, record: toOrderRecord(row, [], new OrderProductLookup()) };
}
async function operation(
  row: typeof orders.$inferSelect,
  kind: 'post' | 'update' | 'delete' = 'post',
  request = {},
) {
  return claimEcotrackMutation(getDb(), {
    orderId: row.id,
    orderUpdatedAt: row.updatedAt,
    kind,
    provider: 'delivro',
    trackingNumber: row.ecotrackTrackingNumber,
    request: { record: input(row).record, ...request },
    actor,
  });
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
  it('keeps unknown effects locked until a verified recovery and does not resend them', async () => {
    const db = getDb();
    const row = await createOrder();
    const claimed = await operation(row);
    await markEcotrackMutationUncertain(db, claimed, new Error('Connection reset after send'));
    await expect(
      recoverEcotrackMutation(
        {
          operationId: claimed.id,
          action: 'confirm_not_applied',
        },
        actor,
        db,
      ),
    ).rejects.toThrow('response window');
    await db
      .update(ecotrackMutations)
      .set({ createdAt: new Date(Date.now() - 121_000) })
      .where(eq(ecotrackMutations.id, claimed.id));
    upstream.tracking.mockResolvedValue({
      data: { OrderInfo: { tracking: 'wrong', reference: 'wrong' } },
      payload: {},
    });
    await expect(
      recoverEcotrackMutation(
        {
          operationId: claimed.id,
          action: 'confirm_applied',
          trackingNumber: 'wrong',
        },
        actor,
        db,
      ),
    ).rejects.toThrow('does not match');
    upstream.tracking.mockResolvedValue({
      data: { OrderInfo: { tracking: `FOUND-${row.id}`, reference: String(row.id) } },
      payload: { success: true },
    });
    await recoverEcotrackMutation(
      {
        operationId: claimed.id,
        action: 'confirm_applied',
        trackingNumber: `FOUND-${row.id}`,
      },
      actor,
      db,
    );
    const [saved] = await db
      .select()
      .from(ecotrackMutations)
      .where(eq(ecotrackMutations.id, claimed.id));
    expect(saved).toMatchObject({ state: 'applied', response: { recovery: { actor } } });
    expect((saved!.response!.recovery as Record<string, unknown>).evidence).toBeUndefined();
    expect(
      (await db.select().from(orders).where(eq(orders.id, row.id)))[0]!.ecotrackTrackingNumber,
    ).toBe(`FOUND-${row.id}`);
  });

  it('deletes a dispatched local order only after carrier acceptance, then reposts as Posted', async () => {
    const db = getDb();
    const row = await createOrder({ inHouseStatus: ORDER_STATUS.DISPATCHED }, true);
    upstream.remove.mockResolvedValue({ success: true, payload: { success: true } });
    expect(await deletePostedEcotrackOrder(row.id, actor)).toMatchObject({ ok: true });
    const [deleted] = await db.select().from(orders).where(eq(orders.id, row.id));
    expect(deleted).toMatchObject({
      inHouseStatus: ORDER_STATUS.CONFIRMED,
      ecotrackTrackingNumber: null,
    });
    const claimed = await operation(deleted!);
    const saved = await recordEcotrackMutationResult(
      db,
      claimed,
      { success: true, tracking: `REPOST-${row.id}`, raw: { success: true }, message: null },
      true,
    );
    await applySavedEcotrackMutation(db, saved);
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({
      inHouseStatus: ORDER_STATUS.POSTED,
      ecotrackTrackingNumber: `REPOST-${row.id}`,
    });
    expect(
      (
        await db.select().from(ecotrackOrderStates).where(eq(ecotrackOrderStates.orderId, row.id))
      )[0]!.deletedAt,
    ).toBeNull();
  });

  it('uses the carrier workflow for posted commercial changes, preserves promotions, and clears overrides correctly', async () => {
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        title: 'Carrier offer',
        slug: randomUUID(),
        price: '1000',
        active: true,
        inStock: true,
      })
      .returning();
    productIds.push(product!.id);
    await db.insert(productPromoCodes).values({
      productId: product!.id,
      code: 'OFFER',
      normalizedCode: 'offer',
      promoPrice: '800',
    });
    const row = await createOrder(
      {
        cartProducts: [String(product!.id)],
        productPromos: [{ productId: product!.id, code: 'OFFER' }],
        productSubtotal: '800',
        price: '700',
        totalAmount: '900',
      },
      true,
    );
    await expect(
      updateAdminOrder(db, row.id, { homeAddress: 'Different address' }, actor),
    ).rejects.toBeInstanceOf(EcotrackMutationConflictError);
    upstream.update.mockResolvedValue({ success: true, payload: { success: true } });
    await updatePostedEcotrackOrder(
      row.id,
      parseEcotrackShipmentUpdateDraft({
        firstName: row.firstName,
        phoneNumber1: row.phoneNumber1,
        delivery: 1,
        state: 16,
        city: 'Alger',
        homeAddress: 'New address',
        cartProducts: [String(product!.id), String(product!.id)],
        subtotalOverride: null,
      }),
      actor,
    );
    expect(upstream.update.mock.calls[0]![0].montant).toBe('1800');
    const [saved] = await db.select().from(orders).where(eq(orders.id, row.id));
    expect(saved).toMatchObject({
      price: null,
      productSubtotal: '1600.00',
      totalAmount: '1800.00',
      productPromos: [{ productId: product!.id, code: 'OFFER' }],
    });
    const [shipment] = await db
      .select()
      .from(ecotrackOrderStates)
      .where(eq(ecotrackOrderStates.orderId, row.id));
    expect(shipment).toMatchObject({
      currentAmount: '1800.00',
      currentAmountSource: 'submitted_order',
      stopDesk: true,
      lastStatusSyncedAt: null,
    });
    const [line] = await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, row.id));
    expect(line).toMatchObject({ quantity: 2, effectiveUnitPrice: '800.00' });
    await db.update(orders).set({ price: '700', totalAmount: '900' }).where(eq(orders.id, row.id));
    await updatePostedEcotrackOrder(
      row.id,
      parseEcotrackShipmentUpdateDraft({
        firstName: row.firstName,
        phoneNumber1: row.phoneNumber1,
        delivery: 0,
        state: 16,
        city: 'Alger',
        homeAddress: 'New address',
        subtotalOverride: null,
      }),
      actor,
    );
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({
      price: null,
      productSubtotal: '1600.00',
      totalAmount: '1800.00',
    });
    const linesBeforeNote = await db
      .select()
      .from(orderLineItems)
      .where(eq(orderLineItems.orderId, row.id));
    await db.update(products).set({ price: '3000' }).where(eq(products.id, product!.id));
    await db
      .update(productPromoCodes)
      .set({ promoPrice: '2500' })
      .where(eq(productPromoCodes.productId, product!.id));
    // This edit lands after the assistant's earlier inspection, before its explicit note patch.
    await db
      .update(orders)
      .set({
        firstName: 'Current operator edit',
        price: '1200',
        totalAmount: '1400',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, row.id));
    await updatePostedEcotrackOrder(row.id, { note: 'Call after 17:00' }, actor);
    expect(upstream.update.mock.lastCall![0]).toMatchObject({
      client: 'Current operator edit',
      montant: '1400',
      remarque: 'Call after 17:00',
    });
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({
      firstName: 'Current operator edit',
      note: 'Call after 17:00',
      price: '1200.00',
      productSubtotal: '1600.00',
      totalAmount: '1400.00',
    });
    expect(
      await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, row.id)),
    ).toEqual(linesBeforeNote);
  });

  it('records actual reconciliation snapshots and keeps identical events from separate attempts', async () => {
    const db = getDb();
    const row = await createOrder({}, true);
    const shipment = (await loadShipmentRowByOrderId(db, row.id))!;
    await db
      .update(orders)
      .set({
        confirmedBy: 'first@example.invalid',
        confirmedByName: 'First',
        confirmedAt: new Date('2025-01-01'),
      })
      .where(eq(orders.id, row.id));
    await upsertShipmentState(
      db,
      shipment,
      { statusItem: { status: 'en_livraison', activity: [] } },
      actor,
    );
    const [actual] = await db.select().from(orders).where(eq(orders.id, row.id));
    const audits = await db
      .select()
      .from(actionLogs)
      .where(and(eq(actionLogs.entityId, row.id), eq(actionLogs.entityType, 'orders')));
    expect(audits.at(-1)!.afterState).toMatchObject({
      confirmedBy: actual!.confirmedBy,
      confirmedByName: actual!.confirmedByName,
      inHouseStatus: actual!.inHouseStatus,
    });
    await db.transaction(async (tx) => {
      const evidence = {
        statusItem: { status: 'prete_a_expedier', activity: [] },
        observedAt: new Date(),
      };
      await persistStatusEvidence(tx, shipment, evidence);
      await persistStatusEvidence(tx, { ...shipment, trackingNumber: 'SECOND-ATTEMPT' }, evidence);
    });
    const observations = await db
      .select()
      .from(ecotrackOrderStatusObservations)
      .where(
        and(
          eq(ecotrackOrderStatusObservations.orderId, row.id),
          eq(ecotrackOrderStatusObservations.status, 'prete_a_expedier'),
        ),
      );
    expect(observations.map((entry) => entry.trackingNumber).sort()).toEqual(
      ['SECOND-ATTEMPT', shipment.trackingNumber].sort(),
    );
  });
});
