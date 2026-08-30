import { describe, expect, it } from 'vitest';

import {
  areEcotrackActionSnapshotsEqual,
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from './ecotrack-action-snapshots';

describe('ECOTRACK action snapshots', () => {
  const shipment = (estimatedFee: string | null) => ({
    id: 3,
    orderId: 9,
    reference: '9',
    trackingNumber: 'TRK-9',
    provider: 'delivro' as const,
    currentStatus: 'en_livraison',
    driverPhone: null,
    estimatedFee,
    deskPhone: null,
    deskCommune: null,
    deskMapLink: null,
    deskAddress: null,
    lastActionAt: null,
    deletedAt: null,
  });

  it('ignores polling timestamps and raw provider payloads', () => {
    const base = {
      id: 3,
      orderId: 9,
      reference: '9',
      trackingNumber: 'TRK-9',
      provider: 'delivro' as const,
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
        buildEcotrackShipmentActionSnapshot(base),
        buildEcotrackShipmentActionSnapshot(refreshed),
      ),
    ).toBe(true);
  });

  it('keeps meaningful order and shipment changes', () => {
    const order = {
      id: 9,
      inHouseStatus: 2,
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
        buildEcotrackOrderActionSnapshot(order),
        buildEcotrackOrderActionSnapshot(changed),
      ),
    ).toBe(false);
    expect(buildEcotrackOrderActionSnapshot(order)).toMatchObject({ inHouseStatus: 2 });
    expect(buildEcotrackOrderActionSnapshot(order)).not.toHaveProperty('ecotrackStatusData');
    expect(buildEcotrackOrderActionSnapshot(order)).not.toHaveProperty('updatedAt');
  });

  it.each([
    ['600.00', '600'],
    ['0600.0', '600.000'],
    ['600.004', '600.00'],
    ['600.005', '600.01'],
  ])('treats equivalent decimal representations %s and %s as equal', (left, right) => {
    expect(
      areEcotrackActionSnapshotsEqual(
        buildEcotrackShipmentActionSnapshot(shipment(left)),
        buildEcotrackShipmentActionSnapshot(shipment(right)),
      ),
    ).toBe(true);
  });

  it('keeps genuine monetary changes', () => {
    expect(
      areEcotrackActionSnapshotsEqual(
        buildEcotrackShipmentActionSnapshot(shipment('600.00')),
        buildEcotrackShipmentActionSnapshot(shipment('600.01')),
      ),
    ).toBe(false);
  });

  it('keeps null monetary values stable', () => {
    expect(
      areEcotrackActionSnapshotsEqual(
        buildEcotrackShipmentActionSnapshot(shipment(null)),
        buildEcotrackShipmentActionSnapshot(shipment(null)),
      ),
    ).toBe(true);
  });

  it('retains invalid monetary values as detectable audit differences', () => {
    expect(
      areEcotrackActionSnapshotsEqual(
        buildEcotrackShipmentActionSnapshot(shipment('not-a-number')),
        buildEcotrackShipmentActionSnapshot(shipment(null)),
      ),
    ).toBe(false);
    expect(
      areEcotrackActionSnapshotsEqual(
        buildEcotrackShipmentActionSnapshot(shipment('not-a-number')),
        buildEcotrackShipmentActionSnapshot(shipment('different-invalid-value')),
      ),
    ).toBe(false);
  });
});
