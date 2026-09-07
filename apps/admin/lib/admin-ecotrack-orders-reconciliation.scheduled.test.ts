import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getDbMock,
  deleteEcotrackOrderMock,
  getEcotrackOrderMock,
  getEcotrackOrdersStatusMock,
  getEcotrackTrackingsInfoMock,
  getEcotrackMajMock,
} = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  deleteEcotrackOrderMock: vi.fn(),
  getEcotrackOrderMock: vi.fn(),
  getEcotrackOrdersStatusMock: vi.fn(),
  getEcotrackTrackingsInfoMock: vi.fn(),
  getEcotrackMajMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: getDbMock,
  hasDb: () => true,
}));

vi.mock('@bric/storefront-core/ecotrack-client', async () => {
  const actual = await vi.importActual<typeof import('@bric/storefront-core/ecotrack-client')>(
    '@bric/storefront-core/ecotrack-client',
  );
  return {
    ...actual,
    deleteEcotrackOrder: deleteEcotrackOrderMock,
    getEcotrackOrder: getEcotrackOrderMock,
    getEcotrackOrdersStatus: getEcotrackOrdersStatusMock,
    getEcotrackTrackingsInfo: getEcotrackTrackingsInfoMock,
    getEcotrackMaj: getEcotrackMajMock,
  };
});

import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  ecotrackSyncRuns,
  orderLineItems,
  orders,
} from '@bric/db/schema';
import { syncEcotrackShipmentStates } from './admin-ecotrack-orders-data';

function createShipmentRow(orderId = 11) {
  const now = new Date();
  return {
    id: 80 + orderId,
    orderId,
    reference: String(orderId),
    trackingNumber: `TRK-${orderId}`,
    currentStatus: 'prete_a_expedier',
    driverPhone: null,
    estimatedFee: null,
    deskPhone: null,
    deskCommune: null,
    deskMapLink: null,
    deskAddress: null,
    rawStatusPayload: null,
    rawCreatePayload: null,
    rawLastTrackingPayload: null,
    rawLastMajPayload: null,
    lastStatusSyncedAt: now,
    lastTrackingSyncedAt: now,
    lastMajSyncedAt: now,
    lastActionAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    order: {
      id: orderId,
      publicToken: null,
      variant: null,
      createdAt: now,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: null,
      phoneNumber1: '0550000011',
      phoneNumber2: null,
      cartProducts: [],
      delivery: 0,
      state: 16,
      city: 'Bab Ezzouar',
      homeAddress: 'Street 11',
      note: null,
      deliveryFee: '0',
      inHouseStatus: 2,
      noAnswerCount: 0,
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: null,
      ecotrackTrackingNumber: `TRK-${orderId}`,
      ecotrackReference: String(orderId),
      ecotrackStatus: 'prete_a_expedier',
      ecotrackStatusLastUpdate: now,
      ecotrackStatusData: null,
      updatedAt: now,
    },
  };
}

function createDbMock(
  rows: Array<ReturnType<typeof createShipmentRow>>,
  options?: {
    limitSequence?: number[];
    rejectShipmentWrites?: boolean;
    currentOrder?: Partial<ReturnType<typeof createShipmentRow>['order']>;
  },
) {
  const updates: Array<{ target: unknown; values: Record<string, unknown> }> = [];
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    then: (resolve: (value: undefined) => unknown) => Promise.resolve(undefined).then(resolve),
  }));
  const rowByOrderId = new Map(rows.map((row) => [row.order.id, row]));
  const limitSequence = [...(options?.limitSequence ?? rows.map((row) => row.order.id))];
  const pageCursors: number[] = [];
  const pageLimit = vi.fn(async (size: number, afterId: number) => {
    pageCursors.push(afterId);
    const page = rows.filter((row) => row.id > afterId).slice(0, size);
    return page.map((row) => ({ state: row, order: row.order }));
  });
  const makeFromChain = (table: unknown) => ({
    innerJoin: vi.fn(() => ({
      where: vi.fn((condition: Parameters<PgDialect['sqlToQuery']>[0]) => ({
        orderBy: vi.fn(() =>
          Object.assign(
            Promise.resolve(
              rows
                .filter((row) => {
                  const query = new PgDialect().sqlToQuery(condition);
                  return (
                    !query.sql.includes('"order_id" in') || query.params.includes(row.order.id)
                  );
                })
                .map((row) => ({ state: row, order: row.order })),
            ),
            {
              limit: (size: number) => {
                const query = new PgDialect().sqlToQuery(condition);
                expect(query.sql).toContain('"id" > $1');
                return pageLimit(size, query.params[0] as number);
              },
            },
          ),
        ),
        limit: vi.fn(async () => {
          const nextOrderId = limitSequence.shift();
          if (nextOrderId == null) {
            return [];
          }
          const row = rowByOrderId.get(nextOrderId);
          return row ? [{ state: row, order: row.order }] : [];
        }),
      })),
    })),
    where: vi.fn(() =>
      table === orderLineItems
        ? Promise.resolve([])
        : {
            orderBy: vi.fn(async () => {
              if (table === ecotrackOrderMajEntries || table === ecotrackOrderTrackingEvents) {
                return [];
              }

              return rows.map((row) => ({ state: row, order: row.order }));
            }),
            limit: vi.fn(async () => []),
          },
    ),
    orderBy: vi.fn(() => {
      if (table === ecotrackSyncRuns) {
        return {
          limit: vi.fn(async () => []),
        };
      }

      return [];
    }),
  });
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: vi.fn((condition: Parameters<PgDialect['sqlToQuery']>[0]) => ({
          for: vi.fn(async () => {
            const id = Number(new PgDialect().sqlToQuery(condition).params[0]);
            const current =
              table === orders ? rowByOrderId.get(id) : rows.find((row) => row.id === id);
            return current
              ? [table === orders ? { ...current.order, ...options?.currentOrder } : current]
              : [];
          }),
          limit: vi.fn(async () => []),
          then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
        })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: vi.fn(() => {
          updates.push({ target: table, values });
          return {
            returning: vi.fn(async () =>
              table === ecotrackOrderStates && options?.rejectShipmentWrites
                ? []
                : rows[0]
                  ? [{ ...(table === ecotrackOrderStates ? rows[0] : rows[0].order), ...values }]
                  : [],
            ),
            then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
          };
        }),
      }),
    })),
    insert: vi.fn(() => ({ values: insertValues })),
  };

  const db = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => makeFromChain(table)),
    })),
    transaction: vi.fn(async (callback: (trx: typeof tx) => Promise<void>) => callback(tx)),
  };

  return { db, updates, pageLimit, pageCursors };
}

describe('admin ecotrack shipment reconciliation', () => {
  beforeEach(() => {
    getDbMock.mockReset();
    deleteEcotrackOrderMock.mockReset();
    getEcotrackOrderMock.mockReset();
    getEcotrackOrdersStatusMock.mockReset();
    getEcotrackTrackingsInfoMock.mockReset();
    getEcotrackMajMock.mockReset();
  });

  it('keeps scheduled status reconciliation moving when one optional MAJ request is rejected', async () => {
    const firstRow = createShipmentRow(11);
    const secondRow = createShipmentRow(12);
    const { db } = createDbMock([firstRow, secondRow]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({
      data: new Map([
        ['TRK-11', { status: 'en_livraison', activity: [] }],
        ['TRK-12', { status: 'en_livraison', activity: [] }],
      ]),
    });
    getEcotrackTrackingsInfoMock.mockResolvedValue({
      data: new Map([
        ['TRK-11', { activity: [] }],
        ['TRK-12', { activity: [] }],
      ]),
    });
    getEcotrackMajMock
      .mockRejectedValueOnce(new Error('selected tracking is invalid'))
      .mockResolvedValueOnce({ data: [] });

    await expect(syncEcotrackShipmentStates({ includeMaj: true })).resolves.toEqual({
      total: 2,
      synced: 2,
      missing: 0,
      retired: 0,
      fallbackChecked: 0,
      fallbackRecovered: 0,
      fallbackDeferred: 0,
      superseded: 0,
      failed: 0,
      batchFailed: 0,
      majFailed: 1,
    });
    expect(getEcotrackMajMock).toHaveBeenCalledTimes(2);
  });

  it('streams multiple database pages in provider-specific batches, including past skipped pages', async () => {
    const rows = Array.from({ length: 1101 }, (_, index) => ({
      ...createShipmentRow(index + 1),
      provider: index % 2 ? 'emir' : 'delivro',
      currentStatus: index < 500 ? 'payed' : 'en_livraison',
      currentAmountSource: 'ecotrack_orders',
      deliveryTariff: '400',
    }));
    const { db, pageLimit, pageCursors } = createDbMock(rows);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockImplementation(async (trackings: string[]) => {
      expect(pageLimit.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(trackings.length).toBeLessThanOrEqual(100);
      const parity = trackings.map((tracking) => Number(tracking.slice(4)) % 2);
      expect(new Set(parity).size).toBe(1);
      return {
        data: new Map(
          trackings.map((tracking) => [tracking, { status: 'en_livraison', activity: [] }]),
        ),
      };
    });
    getEcotrackTrackingsInfoMock.mockResolvedValue({ data: new Map() });

    const result = await syncEcotrackShipmentStates();

    expect(result).toMatchObject({ total: 601, synced: 601, failed: 0 });
    expect(pageLimit.mock.calls.map(([size]) => size)).toEqual([500, 500, 500]);
    expect(pageCursors).toEqual([0, 580, 1080]);
    const processed = getEcotrackOrdersStatusMock.mock.calls.flatMap(([trackings]) => trackings);
    expect(new Set(processed).size).toBe(601);
    expect(processed).toContain('TRK-1101');
    expect(processed).not.toContain('TRK-500');
  });

  it('keeps periodic reconciliation bounded by skipping per-shipment MAJ requests', async () => {
    const row = {
      ...createShipmentRow(11),
      lastMajSyncedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const { db } = createDbMock([row]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({
      data: new Map([['TRK-11', { status: 'en_livraison', activity: [] }]]),
    });
    getEcotrackTrackingsInfoMock.mockResolvedValue({
      data: new Map([['TRK-11', { activity: [] }]]),
    });

    await expect(syncEcotrackShipmentStates()).resolves.toEqual({
      total: 1,
      synced: 1,
      missing: 0,
      retired: 0,
      fallbackChecked: 0,
      fallbackRecovered: 0,
      fallbackDeferred: 0,
      superseded: 0,
      failed: 0,
      batchFailed: 0,
      majFailed: 0,
    });
    expect(getEcotrackMajMock).not.toHaveBeenCalled();
  });

  it('reconciles an in-delivery order when EcoTrack reports a dispatched-stage status', async () => {
    const row = createShipmentRow(11);
    row.order.inHouseStatus = 7;
    const { db, updates } = createDbMock([row]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({
      data: new Map([['TRK-11', { status: 'en_ramassage', activity: [] }]]),
    });
    getEcotrackTrackingsInfoMock.mockResolvedValue({
      data: new Map([['TRK-11', { activity: [] }]]),
    });

    await expect(syncEcotrackShipmentStates()).resolves.toMatchObject({
      total: 1,
      synced: 1,
      failed: 0,
    });
    expect(updates).toContainEqual(
      expect.objectContaining({
        target: orders,
        values: expect.objectContaining({
          inHouseStatus: 3,
          ecotrackStatus: 'en_ramassage',
        }),
      }),
    );
  });

  it('discards a stale EcoTrack response after the stored tracking number was replaced', async () => {
    const row = createShipmentRow(11);
    const { db, updates } = createDbMock([row], { rejectShipmentWrites: true });
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({
      data: new Map([['TRK-11', { status: 'en_livraison', activity: [] }]]),
    });
    getEcotrackTrackingsInfoMock.mockResolvedValue({
      data: new Map([['TRK-11', { activity: [] }]]),
    });

    await expect(syncEcotrackShipmentStates()).resolves.toEqual({
      total: 1,
      synced: 0,
      missing: 0,
      retired: 0,
      fallbackChecked: 0,
      fallbackRecovered: 0,
      fallbackDeferred: 0,
      superseded: 1,
      failed: 0,
      batchFailed: 0,
      majFailed: 0,
    });
    expect(updates.filter((update) => update.target === orders)).toEqual([]);
  });

  it('reports a recent authoritative-status omission without claiming the row was synced', async () => {
    const row = createShipmentRow(11);
    const { db, updates } = createDbMock([row]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockResolvedValue({
      data: new Map([['TRK-11', { activity: [] }]]),
    });

    await expect(syncEcotrackShipmentStates()).resolves.toEqual({
      total: 1,
      synced: 0,
      missing: 1,
      retired: 0,
      fallbackChecked: 0,
      fallbackRecovered: 0,
      fallbackDeferred: 0,
      superseded: 0,
      failed: 0,
      batchFailed: 0,
      majFailed: 0,
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      target: ecotrackOrderStates,
      values: {
        rawLastTrackingPayload: { activity: [] },
      },
    });
    expect(updates[0]?.values).not.toHaveProperty('lastStatusSyncedAt');
  });
});
