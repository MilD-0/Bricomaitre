import { describe, expect, it } from 'vitest';

import type { EcotrackShipmentListItem } from './ecotrack-admin-contracts';
import {
  applyEcotrackShipmentListQuery,
  parseEcotrackShipmentListQuery,
} from './ecotrack-shipment-list';

function shipment(
  orderId: number,
  overrides: Partial<EcotrackShipmentListItem> = {},
): EcotrackShipmentListItem {
  return {
    orderId,
    reference: `order-${orderId}`,
    trackingNumber: `TRK-${orderId}`,
    provider: 'delivro',
    createdAt: `2026-08-${String(orderId).padStart(2, '0')}T10:00:00.000Z`,
    updatedAt: `2026-08-${String(orderId).padStart(2, '0')}T10:00:00.000Z`,
    firstName: 'Client',
    lastName: String(orderId),
    fullName: `Client ${orderId}`,
    phoneNumber1: `055500000${orderId}`,
    phoneNumber2: null,
    delivery: 0,
    deliveryLabel: 'home',
    state: 16,
    stateName: 'Alger',
    city: 'Hydra',
    homeAddress: 'Main street',
    orderProducts: [],
    subtotalOverride: null,
    productSubtotal: 1_000,
    deliveryFee: 400,
    totalAmount: 1_400,
    note: null,
    status: {
      currentStatus: 'en_livraison',
      driverPhone: null,
      estimatedFee: null,
      deskPhone: null,
      deskCommune: null,
      deskMapLink: null,
      deskAddress: null,
      lastStatusSyncedAt: '2026-08-20T10:00:00.000Z',
      lastTrackingSyncedAt: '2026-08-20T10:00:00.000Z',
      lastMajSyncedAt: '2026-08-20T10:00:00.000Z',
      isStatusStale: false,
      isTrackingStale: false,
      isMajStale: false,
    },
    canEdit: false,
    canDelete: false,
    canDispatch: false,
    canEditAndRecreate: true,
    canAddMaj: true,
    canAskReturn: true,
    canPrintLabel: true,
    ...overrides,
  };
}

describe('EcoTrack shipment list query', () => {
  it('combines status, stale, and text filters before pagination', () => {
    const matching = shipment(3, {
      fullName: 'Samira Benali',
      status: {
        ...shipment(3).status,
        currentStatus: 'en_hub',
        isTrackingStale: true,
      },
    });
    const query = parseEcotrackShipmentListQuery({
      status: 'en_hub',
      staleOnly: true,
      search: 'samira',
      limit: 1,
    });

    const result = applyEcotrackShipmentListQuery(
      [shipment(1), matching, shipment(2, { fullName: 'Samira Benali' })],
      query,
    );

    expect(result.pageItems).toEqual([matching]);
    expect(result.pagination).toMatchObject({ page: 1, totalItems: 1, totalPages: 1 });
  });

  it('uses ordered multi-sort rules and clamps an oversized page', () => {
    const query = parseEcotrackShipmentListQuery({
      page: 9,
      limit: 2,
      sort: ['currentStatus:asc', 'trackingNumber:desc'],
    });

    const result = applyEcotrackShipmentListQuery(
      [
        shipment(1, { trackingNumber: 'TRK-A' }),
        shipment(2, { trackingNumber: 'TRK-C' }),
        shipment(3, {
          trackingNumber: 'TRK-B',
          status: { ...shipment(3).status, currentStatus: 'payed' },
        }),
      ],
      query,
    );

    expect(result.pagination).toMatchObject({ page: 2, totalItems: 3, totalPages: 2 });
    expect(result.pageItems.map((item) => item.trackingNumber)).toEqual(['TRK-B']);
  });

  it('rejects unsupported sort fields', () => {
    expect(() => parseEcotrackShipmentListQuery({ sort: ['totalAmount:desc'] })).toThrow(/sort/i);
  });
});
