import { describe, expect, it } from 'vitest';

import {
  areEcotrackActionSnapshotsEqual,
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from './ecotrack-action-snapshots';

describe('ECOTRACK action snapshots', () => {
  it('ignores polling timestamps and raw provider payloads', () => {
    const base = {
      id: 3,
      orderId: 9,
      reference: '9',
      trackingNumber: 'TRK-9',
      provider: 'delivro',
      currentStatus: 'en_livraison',
      driverPhone: null,
      estimatedFee: '450',
      deskPhone: null,
      deskCommune: null,
      deskMapLink: null,
      deskAddress: null,
      lastActionAt: null,
      deletedAt: null,
      updatedAt: new Date('2026-07-01T00:00:00Z'),
      lastStatusSyncedAt: new Date('2026-07-01T00:00:00Z'),
      rawStatusPayload: { request: 1 },
    };
    const refreshed = {
      ...base,
      updatedAt: new Date('2026-07-01T00:15:00Z'),
      lastStatusSyncedAt: new Date('2026-07-01T00:15:00Z'),
      rawStatusPayload: { request: 2 },
    };

    expect(
      areEcotrackActionSnapshotsEqual(
        buildEcotrackShipmentActionSnapshot(base as never),
        buildEcotrackShipmentActionSnapshot(refreshed as never),
      ),
    ).toBe(true);
  });

  it('keeps meaningful order and shipment changes', () => {
    const order = {
      id: 9,
      confirmed: 2,
      noAnswerCount: 0,
      confirmedBy: null,
      confirmedByName: null,
      confirmedAt: null,
      ecotrackStatus: 'en_livraison',
      ecotrackReference: '9',
      ecotrackTrackingNumber: 'TRK-9',
      ecotrackStatusLastUpdate: new Date(),
      ecotrackStatusData: { ignored: true },
      updatedAt: new Date(),
    };
    const changed = { ...order, ecotrackStatus: 'livre' };

    expect(
      areEcotrackActionSnapshotsEqual(
        buildEcotrackOrderActionSnapshot(order as never),
        buildEcotrackOrderActionSnapshot(changed as never),
      ),
    ).toBe(false);
    expect(buildEcotrackOrderActionSnapshot(order as never)).not.toHaveProperty(
      'ecotrackStatusData',
    );
    expect(buildEcotrackOrderActionSnapshot(order as never)).not.toHaveProperty('updatedAt');
  });
});
