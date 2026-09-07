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

  it('soft-retires a shipment omitted from the authoritative status feed for a full day', async () => {
    const row = {
      ...createShipmentRow(11),
      lastStatusSyncedAt: new Date('2026-08-17T00:00:00.000Z'),
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
    };
    const { db, updates } = createDbMock([row]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockResolvedValue({
      data: new Map([['TRK-11', { activity: [] }]]),
    });
    getEcotrackOrderMock.mockResolvedValue({ data: null });

    await expect(syncEcotrackShipmentStates()).resolves.toEqual({
      total: 1,
      synced: 0,
      missing: 0,
      retired: 1,
      fallbackChecked: 1,
      fallbackRecovered: 0,
      fallbackDeferred: 0,
      superseded: 0,
      failed: 0,
      batchFailed: 0,
      majFailed: 0,
    });
    expect(
      updates.filter((update) => update.target === orders || update.target === ecotrackOrderStates),
    ).toHaveLength(2);
    expect(updates.find((update) => update.target === orders)?.values).toMatchObject({
      ecotrackStatus: null,
      ecotrackStatusLastUpdate: null,
      ecotrackStatusData: null,
      ecotrackReference: null,
      ecotrackTrackingNumber: null,
    });
    expect(
      updates.find((update) => update.target === ecotrackOrderStates)?.values.deletedAt,
    ).toBeInstanceOf(Date);
  });

  it('recovers an omitted bulk status from the documented current-order endpoint', async () => {
    const row = {
      ...createShipmentRow(11),
      lastStatusSyncedAt: new Date('2026-08-17T00:00:00.000Z'),
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
    };
    const { db, updates } = createDbMock([row]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockResolvedValue({
      data: new Map([['TRK-11', { activity: [] }]]),
    });
    getEcotrackOrderMock.mockResolvedValue({
      data: { tracking: 'TRK-11', status: 'en_livraison' },
    });

    await expect(syncEcotrackShipmentStates()).resolves.toEqual({
      total: 1,
      synced: 1,
      missing: 0,
      retired: 0,
      fallbackChecked: 1,
      fallbackRecovered: 1,
      fallbackDeferred: 0,
      superseded: 0,
      failed: 0,
      batchFailed: 0,
      majFailed: 0,
    });
    expect(getEcotrackOrderMock).toHaveBeenCalledWith(
      'TRK-11',
      expect.objectContaining({ startDate: '2026-08-16' }),
    );
    expect(updates).toContainEqual(
      expect.objectContaining({
        target: ecotrackOrderStates,
        values: expect.objectContaining({
          currentStatus: 'en_livraison',
          lastStatusSyncedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('bounds current-order fallback checks so one reconciliation stays within provider limits', async () => {
    const rows = Array.from({ length: 41 }, (_, index) => ({
      ...createShipmentRow(index + 1),
      lastStatusSyncedAt: new Date('2026-08-17T00:00:00.000Z'),
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
    }));
    const { db } = createDbMock(rows);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockResolvedValue({
      data: new Map(rows.map((row) => [row.trackingNumber, { activity: [] }])),
    });
    getEcotrackOrderMock.mockResolvedValue({ data: null });

    await expect(syncEcotrackShipmentStates()).resolves.toMatchObject({
      total: 41,
      synced: 0,
      missing: 1,
      retired: 40,
      fallbackChecked: 40,
      fallbackRecovered: 0,
      fallbackDeferred: 1,
      failed: 0,
    });
    expect(getEcotrackOrderMock).toHaveBeenCalledTimes(40);
  });

  it('keeps a complete scheduled upstream outage visible as a failed job', async () => {
    const { db } = createDbMock([createShipmentRow(11), createShipmentRow(12)]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockRejectedValue(new Error('upstream unavailable'));
    getEcotrackTrackingsInfoMock.mockResolvedValue({ data: new Map() });

    await expect(syncEcotrackShipmentStates()).rejects.toThrow(
      'ECOTRACK shipment sync failed for all 2 candidates.',
    );
    expect(getEcotrackMajMock).not.toHaveBeenCalled();
  });
});
