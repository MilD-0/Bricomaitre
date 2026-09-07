import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  ecotrackMutations,
  ecotrackOrderStates,
  orders,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { OrderProductLookup, toOrderRecord } from '@bric/storefront-core/order-records';
import { ensureCanonicalOrderPublicToken } from '@bric/storefront-core/order-write';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAdminOrder } from '../lib/admin-order-lifecycle';
import { updateAdminOrder } from '../lib/admin-order-update';
import { applySavedEcotrackMutation } from '../lib/ecotrack-mutation-apply';
import {
  claimEcotrackMutation,
  EcotrackMutationConflictError,
  recordEcotrackMutationResult,
} from '../lib/ecotrack-mutations';
import { postOrdersToEcotrack } from '../lib/ecotrack-posting';
import { recoverEcotrackMutation } from '../lib/ecotrack-recovery';

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
});
