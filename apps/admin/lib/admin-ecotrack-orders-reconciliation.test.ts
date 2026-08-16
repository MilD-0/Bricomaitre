import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getDbMock,
  deleteEcotrackOrderMock,
  getEcotrackOrdersStatusMock,
  getEcotrackTrackingsInfoMock,
  getEcotrackMajMock,
} = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  deleteEcotrackOrderMock: vi.fn(),
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
    getEcotrackOrdersStatus: getEcotrackOrdersStatusMock,
    getEcotrackTrackingsInfo: getEcotrackTrackingsInfoMock,
    getEcotrackMaj: getEcotrackMajMock,
  };
});

import {
  deletePostedEcotrackOrder,
  refreshEcotrackOrdersBatch,
  syncEcotrackShipmentStates,
} from './admin-ecotrack-orders-data';
import {
  ecotrackOrderMajEntries,
  ecotrackOrderStates,
  ecotrackOrderTrackingEvents,
  ecotrackSyncRuns,
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
      archivedAt: null,
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
    where: vi.fn(() => ({
      orderBy: vi.fn(async () => {
        if (table === ecotrackOrderMajEntries || table === ecotrackOrderTrackingEvents) {
          return [];
        }

        return rows.map((row) => ({ state: row, order: row.order }));
      }),
      limit: vi.fn(async () => []),
    })),
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
        where: vi.fn(async () => []),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updates.push({ target: table, values });
          return [];
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
    getEcotrackOrdersStatusMock.mockReset();
    getEcotrackTrackingsInfoMock.mockReset();
    getEcotrackMajMock.mockReset();
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
      failed: 0,
      batchFailed: 0,
      majFailed: 0,
    });
    expect(getEcotrackMajMock).not.toHaveBeenCalled();
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
