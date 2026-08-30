import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordExplicitActionLog = vi.hoisted(() => vi.fn());

vi.mock('./action-history', () => ({ recordExplicitActionLog }));

import { buildEcotrackShipmentActionSnapshot } from './ecotrack-action-snapshots';
import { recordEcotrackShipmentAction } from './admin-ecotrack-shipment-audit';

function shipment(estimatedFee: string | null) {
  return buildEcotrackShipmentActionSnapshot({
    id: 3,
    orderId: 9,
    reference: '9',
    trackingNumber: 'TRK-9',
    provider: 'delivro',
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
}

describe('ECOTRACK shipment action audit', () => {
  beforeEach(() => {
    recordExplicitActionLog.mockReset();
  });

  it('does not write an audit row for equivalent persisted and provider fees', async () => {
    await recordEcotrackShipmentAction(
      {} as never,
      9,
      shipment('600.00'),
      shipment('600'),
      null,
      'update',
    );

    expect(recordExplicitActionLog).not.toHaveBeenCalled();
  });

  it('writes an audit row for a genuine fee change', async () => {
    await recordEcotrackShipmentAction(
      {} as never,
      9,
      shipment('600.00'),
      shipment('600.01'),
      null,
      'update',
    );

    expect(recordExplicitActionLog).toHaveBeenCalledOnce();
    expect(recordExplicitActionLog).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        entityType: 'ecotrackShipments',
        entityId: 9,
        operation: 'update',
      }),
    );
  });
});
