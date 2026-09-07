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
  ecotrackWilayas,
  orderLineItems,
  orders,
} from '@bric/db/schema';
import { refreshEcotrackOrder, refreshEcotrackOrdersBatch } from './admin-ecotrack-orders-data';
import { shouldRetireShipmentMissingFromStatusFeed } from './admin-ecotrack-shipment-state';

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

  it('requires a full day without an authoritative status before retiring a shipment', () => {
    const now = new Date('2026-08-19T12:00:00.000Z');

    expect(
      shouldRetireShipmentMissingFromStatusFeed(
        {
          createdAt: new Date('2026-08-18T00:00:00.000Z'),
          lastStatusSyncedAt: new Date('2026-08-18T12:00:01.000Z'),
        },
        now,
      ),
    ).toBe(false);
    expect(
      shouldRetireShipmentMissingFromStatusFeed(
        {
          createdAt: new Date('2026-08-17T00:00:00.000Z'),
          lastStatusSyncedAt: new Date('2026-08-18T12:00:00.000Z'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('preserves positive status evidence when the tracking endpoint returns 404', async () => {
    const row = createShipmentRow();
    const { db, updates } = createDbMock([row], { limitSequence: [11, 11, 11] });
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({
      data: new Map([['TRK-11', { status: 'en_livraison', activity: [] }]]),
    });
    getEcotrackTrackingsInfoMock.mockRejectedValue(
      new Error(
        'ECOTRACK request failed for /get/trackings/info?trackings[]=TRK-11: 404 {"message":"Not Found"}',
      ),
    );
    getEcotrackMajMock.mockResolvedValue({ data: [] });
    const result = await refreshEcotrackOrdersBatch([11]);
    expect(result.failureCount).toBe(0);
    expect(result.items).toHaveLength(1);
    expect(updates.some((update) => update.values.deletedAt)).toBe(false);
    expect(getEcotrackOrderMock).not.toHaveBeenCalled();
  });

  it('retires an unavailable tracking only after a successful current-orders absence check', async () => {
    const row = createShipmentRow();
    const { db, updates } = createDbMock([row]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockRejectedValue(
      new Error(
        'ECOTRACK request failed for /get/trackings/info?trackings[]=TRK-11: 404 {"message":"Trackings non trouvés"}',
      ),
    );

    getEcotrackOrderMock.mockResolvedValue({ data: null });
    await expect(refreshEcotrackOrdersBatch([11])).resolves.toMatchObject({
      ok: true,
      successCount: 1,
      failureCount: 0,
      totalRequested: 1,
      failures: [],
      items: [],
    });

    expect(getEcotrackOrdersStatusMock).toHaveBeenCalledWith(['TRK-11'], 'all');
    expect(getEcotrackTrackingsInfoMock).toHaveBeenCalledWith(['TRK-11']);
    expect(getEcotrackMajMock).not.toHaveBeenCalled();
    expect(
      updates.filter((update) => update.target === orders || update.target === ecotrackOrderStates),
    ).toHaveLength(2);
    expect(updates.some((update) => update.target === orders)).toBe(true);
    expect(updates.some((update) => update.target === ecotrackOrderStates)).toBe(true);
  });

  it('hydrates a batch once without retrying primary requests after stale optional MAJ fails', async () => {
    const firstRow = createShipmentRow(11);
    firstRow.lastMajSyncedAt = new Date(0);
    const secondRow = createShipmentRow(12);
    const { db } = createDbMock([firstRow, secondRow], { limitSequence: [11, 12, 11, 12] });
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock
      .mockRejectedValue(new Error('unexpected second status round'))
      .mockResolvedValueOnce({
        data: new Map([
          ['TRK-11', { status: 'en_livraison', activity: [] }],
          ['TRK-12', { status: 'en_livraison', activity: [] }],
        ]),
      });
    getEcotrackTrackingsInfoMock
      .mockRejectedValue(new Error('unexpected second tracking round'))
      .mockResolvedValueOnce({
        data: new Map([
          ['TRK-11', { activity: [] }],
          ['TRK-12', { activity: [] }],
        ]),
      });
    getEcotrackMajMock
      .mockRejectedValueOnce(new Error('MAJ failed for TRK-11'))
      .mockResolvedValueOnce({ data: [] });

    const result = await refreshEcotrackOrdersBatch([11, 12]);

    expect(getEcotrackMajMock).toHaveBeenCalledTimes(2);
    expect(getEcotrackOrdersStatusMock).toHaveBeenCalledOnce();
    expect(getEcotrackTrackingsInfoMock).toHaveBeenCalledOnce();
    const tables = db.select.mock.results.flatMap(({ value }) =>
      value.from.mock.calls.map(([table]: [unknown]) => table),
    );
    expect(tables.filter((selected) => selected === ecotrackOrderStates)).toHaveLength(2);
    for (const table of [ecotrackWilayas, ecotrackOrderMajEntries, ecotrackOrderTrackingEvents]) {
      expect(tables.filter((selected) => selected === table)).toHaveLength(1);
    }
    expect(result).toMatchObject({
      ok: true,
      successCount: 2,
      failureCount: 0,
      totalRequested: 2,
      failures: [],
    });
    expect(result.items.map((item) => item.orderId)).toEqual([11, 12]);
  });

  it('keeps a shipment when both the tracking endpoint and absence confirmation fail', async () => {
    const { db, updates } = createDbMock([createShipmentRow()]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockRejectedValue(
      new Error('ECOTRACK request failed for /get/trackings/info: 404 Not Found'),
    );
    getEcotrackOrderMock.mockRejectedValue(new Error('Malformed current-orders response'));
    const result = await refreshEcotrackOrdersBatch([11]);
    expect(result.failureCount).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it('updates the manual detail refresh when optional MAJ fails', async () => {
    const { db, updates } = createDbMock([createShipmentRow()], { limitSequence: [11, 11, 11] });
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({
      data: new Map([['TRK-11', { status: 'en_livraison', activity: [] }]]),
    });
    getEcotrackTrackingsInfoMock.mockResolvedValue({ data: new Map() });
    getEcotrackMajMock.mockRejectedValue(new Error('MAJ unavailable'));
    expect(await refreshEcotrackOrder(11)).not.toBeNull();
    expect(updates.some((update) => update.values.currentStatus === 'en_livraison')).toBe(true);
    expect(updates.some((update) => update.values.lastMajSyncedAt)).toBe(false);
  });

  it('records chunk-level fetch failures for every row in that chunk', async () => {
    const firstRow = createShipmentRow(11);
    const secondRow = createShipmentRow(12);
    const { db } = createDbMock([firstRow, secondRow]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockRejectedValue(new Error('Status fetch failed'));

    const result = await refreshEcotrackOrdersBatch([11, 12]);

    expect(result).toMatchObject({
      ok: false,
      successCount: 0,
      failureCount: 2,
      totalRequested: 2,
    });
    expect(result.failures).toEqual([
      {
        orderId: 11,
        reference: '11',
        trackingNumber: 'TRK-11',
        message: 'Order #11 / Ref 11 / Tracking TRK-11: Status fetch failed',
      },
      {
        orderId: 12,
        reference: '12',
        trackingNumber: 'TRK-12',
        message: 'Order #12 / Ref 12 / Tracking TRK-12: Status fetch failed',
      },
    ]);
  });
});
