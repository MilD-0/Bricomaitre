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

vi.mock('../db/client', () => ({
  getDb: getDbMock,
  hasDb: () => true,
}));

vi.mock('@bric/storefront-core', async () => {
  const actual = await vi.importActual<typeof import('@bric/storefront-core')>('@bric/storefront-core');
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
} from './admin-ecotrack-orders-data';
import { ecotrackOrderMajEntries, ecotrackOrderStates, ecotrackOrderTrackingEvents, ecotrackSyncRuns, orders } from '../db/schema';

function createShipmentRow() {
  const now = new Date();
  return {
    id: 91,
    orderId: 11,
    reference: '11',
    trackingNumber: 'TRK-11',
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
      id: 11,
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
      ecotrackTrackingNumber: 'TRK-11',
      ecotrackReference: '11',
      ecotrackStatus: 'prete_a_expedier',
      ecotrackStatusLastUpdate: now,
      ecotrackStatusData: null,
      updatedAt: now,
    },
  } as never;
}

function createDbMock(row: ReturnType<typeof createShipmentRow>) {
  const updates: Array<{ target: unknown; values: Record<string, unknown> }> = [];
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const makeFromChain = (table: unknown) => ({
    innerJoin: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(async () => [{ state: row, order: row.order }]),
      })),
    })),
    where: vi.fn(() => ({
      orderBy: vi.fn(async () => {
        if (table === ecotrackOrderMajEntries || table === ecotrackOrderTrackingEvents) {
          return [];
        }

        return [{ state: row, order: row.order }];
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
    const { db, updates } = createDbMock(row);
    getDbMock.mockReturnValue(db);
    deleteEcotrackOrderMock.mockRejectedValue(new Error(
      'ECOTRACK request failed for /delete/order: 400 {"message":"suppression ok"}',
    ));
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockRejectedValue(new Error(
      'ECOTRACK request failed for /get/trackings/info?trackings[]=TRK-11: 404 {"message":"Trackings non trouvés"}',
    ));

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
    const { db, updates } = createDbMock(row);
    getDbMock.mockReturnValue(db);
    getEcotrackOrdersStatusMock.mockResolvedValue({ data: new Map() });
    getEcotrackTrackingsInfoMock.mockRejectedValue(new Error(
      'ECOTRACK request failed for /get/trackings/info?trackings[]=TRK-11: 404 {"message":"Trackings non trouvés"}',
    ));

    await expect(refreshEcotrackOrdersBatch([11])).resolves.toEqual([]);

    expect(getEcotrackOrdersStatusMock).toHaveBeenCalledWith(['TRK-11'], 'all');
    expect(getEcotrackTrackingsInfoMock).toHaveBeenCalledWith(['TRK-11']);
    expect(getEcotrackMajMock).not.toHaveBeenCalled();
    expect(updates).toHaveLength(2);
    expect(updates[0]?.target).toBe(orders);
    expect(updates[1]?.target).toBe(ecotrackOrderStates);
  });
});
