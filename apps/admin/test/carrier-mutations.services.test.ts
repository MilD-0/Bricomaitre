import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  ecotrackMutations,
  ecotrackOrderActivities,
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderStatusObservations,
  ecotrackOrderTrackingEvents,
  orderLineItems,
  orders,
  productPromoCodes,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { OrderProductLookup, toOrderRecord } from '@bric/storefront-core/order-records';
import { ensureCanonicalOrderPublicToken } from '@bric/storefront-core/order-write';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  deletePostedEcotrackOrder,
  updatePostedEcotrackOrder,
} from '../lib/admin-ecotrack-orders-actions';
import { upsertShipmentState } from '../lib/admin-ecotrack-shipment-state';
import { loadShipmentRowByOrderId } from '../lib/admin-ecotrack-shipment-view';
import { applyAdminInventoryBatch } from '../lib/admin-inventory-workflow';
import {
  AdminOrderHasActiveEcotrackShipmentError,
  deleteAdminOrder,
} from '../lib/admin-order-lifecycle';
import { updateAdminOrder } from '../lib/admin-order-update';
import { applySavedEcotrackMutation } from '../lib/ecotrack-mutation-apply';
import {
  claimEcotrackMutation,
  EcotrackMutationConflictError,
  markEcotrackMutationUncertain,
  recordEcotrackMutationResult,
} from '../lib/ecotrack-mutations';
import { postOrdersToEcotrack } from '../lib/ecotrack-posting';
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
}));
vi.mock('@bric/storefront-core/ecotrack-client', async (original) => ({
  ...(await original<typeof import('@bric/storefront-core/ecotrack-client')>()),
  updateEcotrackOrder: upstream.update,
  deleteEcotrackOrder: upstream.remove,
  getEcotrackTrackingInfo: upstream.tracking,
  getEcotrackOrdersStatus: upstream.status,
  getEcotrackTrackingsInfo: upstream.trackings,
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
const env = {
  NODE_ENV: 'test' as const,
  ECOTRACK_BASE_URL: 'https://carrier.example.invalid/api/v1',
  ECOTRACK_TOKEN: 'test',
  ECOTRACK_MIN_REQUEST_INTERVAL_MS: '0',
};
const catalog = {
  wilayas: [],
  communes: [
    {
      communeId: 1,
      wilayaId: 16,
      name: 'Alger',
      postalCode: null,
      hasStopDesk: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
  serviceFees: [],
  weightFees: [],
  lastSync: null,
};
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
  it('drains accepted batches after cancellation and survives progress-reporting failures', async () => {
    const db = getDb();
    const rows = [await createOrder(), await createOrder()];
    let accepted = false;
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/validate/token')) return Response.json({ success: true });
      accepted = true;
      return Response.json(
        {
          results: Object.fromEntries(
            rows.map((row, index) => [index, { success: true, tracking: `CREATED-${row.id}` }]),
          ),
        },
        { headers: { 'x-ratelimit-remaining-day': '0' } },
      );
    });
    const summary = await postOrdersToEcotrack(db, rows.map(input), catalog, actor, {
      fetchImpl,
      env,
      throwIfCancelled: async () => {
        if (accepted) throw new Error('cancelled');
      },
      updateProgress: async () => {
        if (accepted) throw new Error('progress unavailable');
      },
      updateSummary: async () => {
        if (accepted) throw new Error('progress unavailable');
      },
    });
    expect(summary).toMatchObject({ created: 2, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      (
        await db
          .select()
          .from(ecotrackMutations)
          .where(
            inArray(
              ecotrackMutations.orderId,
              rows.map((row) => row.id),
            ),
          )
      ).map((row) => row.state),
    ).toEqual(['applied', 'applied']);
    const saved = await db
      .select()
      .from(orders)
      .where(
        inArray(
          orders.id,
          rows.map((row) => row.id),
        ),
      );
    expect(
      saved.every(
        (row) =>
          row.inHouseStatus === ORDER_STATUS.POSTED &&
          row.ecotrackTrackingNumber === `CREATED-${row.id}`,
      ),
    ).toBe(true);
  });

  it('distinguishes rejected, uncertain, unapplied and unsent posting outcomes', async () => {
    const db = getDb();
    const rows = [
      await createOrder(),
      await createOrder(),
      await createOrder(),
      await createOrder(),
    ];
    await operation(rows[3]!);
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/validate/token')) return Response.json({ success: true });
      await db
        .update(orders)
        .set({ updatedAt: new Date(rows[0]!.updatedAt.getTime() + 1000) })
        .where(eq(orders.id, rows[0]!.id));
      return Response.json({
        results: {
          0: { success: true, tracking: `ACCEPTED-${rows[0]!.id}` },
          1: { message: 'Carrier did not establish an outcome.' },
          2: { success: false, message: 'Telephone rejected.' },
        },
      });
    });
    const summary = await postOrdersToEcotrack(db, rows.map(input), catalog, actor, {
      fetchImpl,
      env,
    });
    expect(summary).toMatchObject({ created: 0, failed: 4 });
    expect(summary.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orderId: rows[0]!.id,
          failureKind: 'recovery_required',
          tracking: `ACCEPTED-${rows[0]!.id}`,
        }),
        expect.objectContaining({ orderId: rows[1]!.id, failureKind: 'recovery_required' }),
        expect.objectContaining({ orderId: rows[2]!.id, failureKind: 'provider_rejected' }),
        expect.objectContaining({ orderId: rows[3]!.id, failureKind: 'not_sent' }),
      ]),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const saved = await db
      .select()
      .from(ecotrackMutations)
      .where(
        inArray(
          ecotrackMutations.orderId,
          rows.map((row) => row.id),
        ),
      );
    expect(Object.fromEntries(saved.map((row) => [row.orderId, row.state]))).toEqual({
      [rows[0]!.id]: 'succeeded',
      [rows[1]!.id]: 'uncertain',
      [rows[2]!.id]: 'rejected',
      [rows[3]!.id]: 'pending',
    });
  });

  it('publishes each uncertain issued order when the whole carrier batch loses its response', async () => {
    const db = getDb();
    const rows = [await createOrder(), await createOrder()];
    const updateSummary = vi.fn();
    const fetchImpl = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/validate/token')) return Response.json({ success: true });
      throw new Error('Connection lost after send');
    });
    await expect(
      postOrdersToEcotrack(db, rows.map(input), catalog, actor, { fetchImpl, env, updateSummary }),
    ).rejects.toThrow();
    expect(updateSummary).toHaveBeenLastCalledWith(
      expect.objectContaining({
        failed: 2,
        results: rows.map((row) =>
          expect.objectContaining({ orderId: row.id, failureKind: 'recovery_required' }),
        ),
      }),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      (
        await db
          .select()
          .from(ecotrackMutations)
          .where(
            inArray(
              ecotrackMutations.orderId,
              rows.map((row) => row.id),
            ),
          )
      ).every((row) => row.state === 'uncertain'),
    ).toBe(true);
  });

  it('allows only one concurrent claim and blocks ordinary edits and deletion until recovery', async () => {
    const row = await createOrder();
    const claims = await Promise.allSettled([operation(row), operation(row)]);
    expect(claims.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(claims.filter((entry) => entry.status === 'rejected')).toHaveLength(1);
    await expect(
      updateAdminOrder(getDb(), row.id, { note: 'Changed' }, actor),
    ).rejects.toBeInstanceOf(EcotrackMutationConflictError);
    await expect(deleteAdminOrder(getDb(), row.id, actor)).rejects.toBeInstanceOf(
      EcotrackMutationConflictError,
    );
    expect((await getDb().select().from(orders).where(eq(orders.id, row.id)))[0]!.note).toBeNull();
  });

  it('replays an accepted response once after a local transaction failure and rejects stale order revisions', async () => {
    const db = getDb();
    const row = await createOrder();
    const claimed = await operation(row);
    const saved = await recordEcotrackMutationResult(
      db,
      claimed,
      { success: true, tracking: `RECOVER-${row.id}`, raw: { success: true }, message: null },
      true,
    );
    await db
      .update(orders)
      .set({ updatedAt: new Date(row.updatedAt.getTime() + 1000), note: 'concurrent edit' })
      .where(eq(orders.id, row.id));
    await expect(applySavedEcotrackMutation(db, saved)).rejects.toBeInstanceOf(
      EcotrackMutationConflictError,
    );
    expect(
      (await db.select().from(ecotrackMutations).where(eq(ecotrackMutations.id, saved.id)))[0]!
        .state,
    ).toBe('succeeded');
    await db.update(orders).set({ updatedAt: row.updatedAt }).where(eq(orders.id, row.id));
    await recoverEcotrackMutation({ operationId: saved.id, action: 'apply_saved' }, actor, db);
    const audits = await db.select().from(actionLogs).where(eq(actionLogs.entityId, row.id));
    await recoverEcotrackMutation({ operationId: saved.id, action: 'apply_saved' }, actor, db);
    expect(await db.select().from(actionLogs).where(eq(actionLogs.entityId, row.id))).toHaveLength(
      audits.length,
    );
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({
      note: 'concurrent edit',
      ecotrackTrackingNumber: `RECOVER-${row.id}`,
    });
  });

  it('allows token issuance during a carrier request without invalidating accepted recovery', async () => {
    const db = getDb();
    const row = await createOrder();
    const claimed = await operation(row);
    const token = randomUUID();
    await db.transaction((tx) => ensureCanonicalOrderPublicToken(tx, row.id, token));
    const saved = await recordEcotrackMutationResult(
      db,
      claimed,
      { success: true, tracking: `TOKEN-${row.id}`, raw: { success: true }, message: null },
      true,
    );
    await recoverEcotrackMutation({ operationId: saved.id, action: 'apply_saved' }, actor, db);
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({
      publicToken: token,
      ecotrackTrackingNumber: `TOKEN-${row.id}`,
      inHouseStatus: ORDER_STATUS.POSTED,
    });
  });

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
          evidence: 'Checked carrier dashboard.',
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
          evidence: 'Checked carrier dashboard.',
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
        evidence: 'Verified reference and amount in carrier dashboard.',
      },
      actor,
      db,
    );
    const [saved] = await db
      .select()
      .from(ecotrackMutations)
      .where(eq(ecotrackMutations.id, claimed.id));
    expect(saved).toMatchObject({ state: 'applied', response: { recovery: { actor } } });
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

  it('records deletion when the provider returns an error but both status and tracking prove the shipment is gone', async () => {
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
    await expect(deletePostedEcotrackOrder(row.id, actor)).resolves.toMatchObject({ ok: true });
    expect((await db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({
      ecotrackTrackingNumber: null,
      inHouseStatus: ORDER_STATUS.CONFIRMED,
    });
    expect(
      (await db.select().from(ecotrackMutations).where(eq(ecotrackMutations.orderId, row.id)))[0],
    ).toMatchObject({
      state: 'applied',
      response: { raw: { recoveredBy: 'status-and-tracking-absence' } },
    });
  });
});
