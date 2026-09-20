import { getDb, getPool } from '@bric/db/client';
import {
  ecotrackCommunes,
  ecotrackServiceFees,
  ecotrackSyncRuns,
  ecotrackWeightFees,
  ecotrackWilayas,
  ecotrackOrderActivities,
  ecotrackOrderStates,
  orders,
} from '@bric/db/schema';
import { readEcotrackDeliveryQuote } from '@bric/storefront-core/ecotrack-support';
import { eq } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';
import type { EcotrackCatalogSnapshot } from '../lib/ecotrack-catalog/contract';
import { syncEcotrackCatalog } from '../lib/ecotrack-catalog/sync';
import { persistStatusEvidence } from '../lib/ecotrack-shipment-evidence';

const { fetchSnapshot } = vi.hoisted(() => ({ fetchSnapshot: vi.fn() }));
vi.mock('../lib/ecotrack-catalog/fetch', () => ({ fetchEcotrackCatalogSnapshot: fetchSnapshot }));
afterAll(() => getPool().end());

async function rollbackTest(run: (db: ReturnType<typeof getDb>) => Promise<void>) {
  const rollback = new Error('test rollback');
  try {
    await getDb().transaction(async (tx) => {
      await run(tx as unknown as ReturnType<typeof getDb>);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

function snapshot(): EcotrackCatalogSnapshot {
  return {
    wilayas: [
      { wilayaId: 16, name: 'Alger' },
      { wilayaId: 50, name: 'Bordj Badji Mokhtar' },
    ],
    communes: [{ communeId: 1, wilayaId: 16, name: 'Alger', postalCode: null, hasStopDesk: true }],
    serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '500', stopDeskFee: '300' }],
    weightFees: [],
    rateLimits: ['/get/wilayas', '/get/communes', '/get/fees'].map((path) => ({
      path,
      limit: 50,
      remaining: 49,
      reset: null,
    })),
  };
}

it('refreshes priced coverage, keeps unpriced quotes pending, and rolls back tariff loss', async () => {
  await rollbackTest(async (db) => {
    await db.delete(ecotrackWeightFees);
    await db.delete(ecotrackServiceFees);
    await db.delete(ecotrackCommunes);
    await db.delete(ecotrackWilayas);
    fetchSnapshot.mockResolvedValue(snapshot());
    await expect(syncEcotrackCatalog(db)).resolves.toMatchObject({
      unpricedWilayaIds: [50],
      serviceFeeCount: 1,
    });
    expect(await readEcotrackDeliveryQuote(db, 50, 0)).toBeNull();
    expect(await readEcotrackDeliveryQuote(db, 16, 0)).toBe(500);
    const before = await db.select().from(ecotrackServiceFees);
    // A nonempty response still loses the previously priced wilaya 16.
    fetchSnapshot.mockResolvedValue({
      ...snapshot(),
      serviceFees: [{ serviceType: 'livraison', wilayaId: 50, homeFee: '700', stopDeskFee: '400' }],
    });
    await expect(syncEcotrackCatalog(db)).rejects.toThrow('wilaya IDs 16');
    expect(await db.select().from(ecotrackServiceFees)).toEqual(before);
    const failures = await db
      .select()
      .from(ecotrackSyncRuns)
      .where(eq(ecotrackSyncRuns.status, 'failed'));
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestCount: 3,
          errorMessage: expect.stringContaining('wilaya IDs 16'),
        }),
      ]),
    );
    fetchSnapshot.mockResolvedValue({ ...snapshot(), serviceFees: [] });
    await expect(syncEcotrackCatalog(db)).rejects.toThrow('no delivery tariffs');
    expect(await db.select().from(ecotrackServiceFees)).toEqual(before);
  });
});

it('ingests duplicate activities once and keeps distinct activities across repeated refreshes', async () => {
  await rollbackTest(async (db) => {
    const [order] = await db
      .insert(orders)
      .values({ phoneNumber1: '0550000000', firstName: 'Sync test' })
      .returning();
    const [state] = await db
      .insert(ecotrackOrderStates)
      .values({
        orderId: order!.id,
        reference: String(order!.id),
        trackingNumber: `TEST-${order!.id}`,
        currentStatus: 'en_livraison',
      })
      .returning();
    const row = { ...state!, order: order! };
    const activity = { date: '2026-09-17', time: '12:00:00', reason: 'Call', details: 'No answer' };
    const input = {
      statusItem: {
        status: 'en_livraison',
        activity: [activity, { ...activity }, { ...activity, time: '13:00:00' }],
      },
      observedAt: new Date('2026-09-17T14:00:00Z'),
    };
    await db.transaction((tx) => persistStatusEvidence(tx, row, input));
    const later = new Date('2026-09-17T15:00:00Z');
    await db.transaction((tx) => persistStatusEvidence(tx, row, { ...input, observedAt: later }));
    const saved = await db
      .select()
      .from(ecotrackOrderActivities)
      .where(eq(ecotrackOrderActivities.orderId, order!.id));
    expect(saved).toHaveLength(2);
    expect(
      saved.every((entry) => entry.firstObservedAt.getTime() === input.observedAt.getTime()),
    ).toBe(true);
    expect(saved.every((entry) => entry.lastObservedAt.getTime() === later.getTime())).toBe(true);
  });
});
