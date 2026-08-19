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
  deletePostedEcotrackOrder,
  refreshEcotrackOrdersBatch,
  shouldRetireShipmentMissingFromStatusFeed,
  syncEcotrackShipmentStates,
} from './admin-ecotrack-orders-data';
import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  ecotrackSyncRuns,
  orderLineItems,
  orders,
} from '@bric/db/schema';

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
      delPr: '0',
      confirmed: 2,
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
  } as never;
}

function createDbMock(
  rows: Array<ReturnType<typeof createShipmentRow>>,
  options?: { limitSequence?: number[] },
) {
  const updates: Array<{ target: unknown; values: Record<string, unknown> }> = [];
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const rowByOrderId = new Map(rows.map((row) => [row.order.id, row]));
  const limitSequence = [...(options?.limitSequence ?? rows.map((row) => row.order.id))];
  const makeFromChain = (table: unknown) => ({
    innerJoin: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(async () => rows.map((row) => ({ state: row, order: row.order }))),
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
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn(async () => (rows[0] ? [rows[0].order] : [])),
          then: (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
        })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: vi.fn(() => {
          updates.push({ target: table, values });
          return {
            returning: vi.fn(async () => (rows[0] ? [{ ...rows[0].order, ...values }] : [])),
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

  return { db, updates };
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

  it('soft-deletes the local row when upstream delete returns 400 but the tracking is already gone', async () => {
    const row = createShipmentRow();
    const { db, updates } = createDbMock([row]);
    getDbMock.mockReturnValue(db);
    deleteEcotrackOrderMock.mockRejectedValue(
      new Error('ECOTRACK request failed for /delete/order: 400 {"message":"suppression ok"}'),
    );
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockRejectedValue(
      new Error(
        'ECOTRACK request failed for /get/trackings/info?trackings[]=TRK-11: 404 {"message":"Trackings non trouvés"}',
      ),
    );

    await expect(deletePostedEcotrackOrder(11, {})).resolves.toEqual({ ok: true });

    expect(deleteEcotrackOrderMock).toHaveBeenCalledWith('TRK-11');
    expect(getEcotrackOrdersStatusMock).toHaveBeenCalledWith(['TRK-11'], 'all');
    expect(getEcotrackTrackingsInfoMock).toHaveBeenCalledWith(['TRK-11']);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      target: orders,
      values: {
        ecotrackStatus: null,
        ecotrackStatusLastUpdate: null,
        ecotrackStatusData: null,
        ecotrackReference: null,
        ecotrackTrackingNumber: null,
      },
    });
    expect(updates[1].target).toBe(ecotrackOrderStates);
    expect(updates[1]?.values.deletedAt).toBeInstanceOf(Date);
  });

  it('removes missing upstream shipments from batch refreshes instead of throwing', async () => {
    const row = createShipmentRow();
    const { db, updates } = createDbMock([row]);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockRejectedValue(
      new Error(
        'ECOTRACK request failed for /get/trackings/info?trackings[]=TRK-11: 404 {"message":"Trackings non trouvés"}',
      ),
    );

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
    expect(updates).toHaveLength(2);
    expect(updates[0]?.target).toBe(orders);
    expect(updates[1]?.target).toBe(ecotrackOrderStates);
  });

  it('continues refreshing later rows when one row fails', async () => {
    const firstRow = createShipmentRow(11);
    const secondRow = createShipmentRow(12);
    const { db } = createDbMock([firstRow, secondRow], { limitSequence: [11, 12, 12, 12] });
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
      .mockRejectedValueOnce(new Error('MAJ failed for TRK-11'))
      .mockResolvedValueOnce({ data: [] });

    const result = await refreshEcotrackOrdersBatch([11, 12]);

    expect(getEcotrackMajMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      successCount: 1,
      failureCount: 1,
      totalRequested: 2,
      failures: [
        {
          orderId: 11,
          reference: '11',
          trackingNumber: 'TRK-11',
          message: 'Order #11 / Ref 11 / Tracking TRK-11: MAJ failed for TRK-11',
        },
      ],
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.orderId).toBe(12);
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
      failed: 0,
      batchFailed: 0,
      majFailed: 1,
    });
    expect(getEcotrackMajMock).toHaveBeenCalledTimes(2);
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
      failed: 0,
      batchFailed: 0,
      majFailed: 0,
    });
    expect(getEcotrackMajMock).not.toHaveBeenCalled();
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
      failed: 0,
      batchFailed: 0,
      majFailed: 0,
    });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({
      target: orders,
      values: {
        ecotrackStatus: null,
        ecotrackStatusLastUpdate: null,
        ecotrackStatusData: null,
        ecotrackReference: null,
        ecotrackTrackingNumber: null,
      },
    });
    expect(updates[1]).toMatchObject({ target: ecotrackOrderStates });
    expect(updates[1]?.values.deletedAt).toBeInstanceOf(Date);
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
