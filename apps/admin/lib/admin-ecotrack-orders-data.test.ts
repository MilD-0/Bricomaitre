import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseEcotrackShipmentUpdateDraft } from './admin-ecotrack-orders-data';
import type { EcotrackCatalogRecord } from './ecotrack';
import { buildUpdatePayload } from './ecotrack-shipment-input';
import {
  deriveLatestUpstreamActivityAt,
  getUpstreamTrackingValues,
  mapEcotrackOrderSnapshot,
  mapEcotrackStatusToOrderStatus,
  parseEcotrackProviderTimestamp,
  resolveEcotrackStatusEvidence,
} from './ecotrack-shipment-status';
import {
  ANALYTICS_PAID_SHIPMENT_STATUSES,
  ANALYTICS_RESOLVED_SHIPMENT_STATUSES,
} from './ecotrack-status-policy';

describe('admin ECOTRACK shipment mapping', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps ECOTRACK shipment statuses into in-house statuses', () => {
    const freshActivity = new Date('2026-04-08T12:00:00.000Z');

    expect(mapEcotrackStatusToOrderStatus('en_ramassage', freshActivity)).toBe(3);
    expect(mapEcotrackStatusToOrderStatus('vers_hub', freshActivity)).toBe(7);
    expect(mapEcotrackStatusToOrderStatus('suspendu', freshActivity)).toBe(5);
    expect(mapEcotrackStatusToOrderStatus('annule', freshActivity)).toBe(6);
    expect(mapEcotrackStatusToOrderStatus('payed', freshActivity)).toBe(4);
    expect(mapEcotrackStatusToOrderStatus('paye_et_archive', freshActivity)).toBe(4);
    expect(mapEcotrackStatusToOrderStatus('retour_recu', freshActivity)).toBe(8);
  });

  it('marks non-terminal stale shipments as failed after seven days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'));

    expect(
      mapEcotrackStatusToOrderStatus('prete_a_expedier', new Date('2026-04-02T11:59:59.000Z')),
    ).toBe(9);
    expect(
      mapEcotrackStatusToOrderStatus('status_inconnu', new Date('2026-04-02T11:59:59.000Z')),
    ).toBe(9);
    expect(
      mapEcotrackStatusToOrderStatus('status_inconnu', new Date('2026-04-02T12:00:01.000Z')),
    ).toBeNull();
  });

  it('keeps both EcoTrack paid aliases in analytics semantics', () => {
    expect(ANALYTICS_PAID_SHIPMENT_STATUSES).toEqual(['paye_et_archive', 'payed']);
    expect(ANALYTICS_RESOLVED_SHIPMENT_STATUSES).toEqual(
      expect.arrayContaining([...ANALYTICS_PAID_SHIPMENT_STATUSES]),
    );
  });

  it('uses the latest upstream activity timestamp and falls back to stored timestamps', () => {
    const row = {
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      order: {
        ecotrackStatusLastUpdate: new Date('2026-03-05T00:00:00.000Z'),
      },
    } as never;

    const latestActivity = deriveLatestUpstreamActivityAt(row, {
      statusItem: {
        status: 'en_livraison',
        activity: [{ date: '2026-03-10', time: '09:00:00' }],
      } as never,
      trackingInfo: {
        activity: [{ date: '2026-03-12', time: '10:00:00', status: 'vers_hub' }],
      } as never,
      majEntries: [
        {
          remarque: 'updated',
          created_at: '2026-03-11T11:30:00Z',
          tracking: 'TRK1',
        },
      ] as never,
    });

    expect(latestActivity?.toISOString()).toBe('2026-03-12T10:00:00.000Z');

    const fallbackActivity = deriveLatestUpstreamActivityAt(row, {});
    expect(fallbackActivity?.toISOString()).toBe('2026-03-01T00:00:00.000Z');

    const rowWithoutStatusUpdate = {
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
      order: {
        ecotrackStatusLastUpdate: null,
      },
    } as never;

    expect(deriveLatestUpstreamActivityAt(rowWithoutStatusUpdate, {})?.toISOString()).toBe(
      '2026-03-02T00:00:00.000Z',
    );
  });

  it('keeps current provider COD and tariff distinct from submitted order value', () => {
    expect(
      mapEcotrackOrderSnapshot({
        tracking: 'TRK-11',
        status: 'paye_et_archive',
        montant: '12700',
        tarif_prestation: '400',
        tarif_retour: '0',
        stop_desk: 1,
        payment_id: 22,
        status_reason: '',
        created_at: '2026-08-15 10:30:00',
        last_updated_at: '2026-08-16T12:00:00Z',
      }),
    ).toMatchObject({
      currentAmount: '12700.00',
      currentAmountSource: 'ecotrack_orders',
      deliveryTariff: '400.00',
      returnTariff: '0.00',
      stopDesk: true,
      paymentId: '22',
      statusReason: null,
    });
  });

  it('normalizes tracking fees to the persisted numeric scale', () => {
    expect(
      getUpstreamTrackingValues({
        status: 'en_livraison',
        activity: [],
        estimated_fee: '600',
      }),
    ).toMatchObject({ estimatedFee: '600.00' });
    expect(
      getUpstreamTrackingValues({
        status: 'en_livraison',
        activity: [],
        estimated_fee: 'invalid',
      }),
    ).toMatchObject({ estimatedFee: null });
  });

  it('interprets timezone-less provider timestamps as Algeria time', () => {
    expect(parseEcotrackProviderTimestamp('2026-08-15 10:30:00')?.toISOString()).toBe(
      '2026-08-15T09:30:00.000Z',
    );
    expect(parseEcotrackProviderTimestamp('2026-08-15T10:30:00Z')?.toISOString()).toBe(
      '2026-08-15T10:30:00.000Z',
    );
  });

  it('uses bulk tracking status before treating an archived shipment as missing', () => {
    expect(
      resolveEcotrackStatusEvidence(null, {
        status: 'paye_et_archive',
        activity: [],
        deliveryAttempts: [],
      }),
    ).toEqual({ status: 'paye_et_archive', activity: [] });
    expect(
      resolveEcotrackStatusEvidence(
        { status: 'encaisse_non_paye', activity: [] },
        { status: 'paye_et_archive', activity: [], deliveryAttempts: [] },
      ),
    ).toEqual({ status: 'encaisse_non_paye', activity: [] });
  });

  it('builds carrier update fields without inventing package or GPS data', () => {
    const catalog: EcotrackCatalogRecord = {
      wilayas: [
        { wilayaId: 16, name: 'Alger', createdAt: new Date(), updatedAt: new Date() },
      ] as never,
      communes: [
        {
          communeId: 42,
          wilayaId: 16,
          name: 'Bab Ezzouar',
          postalCode: '1621',
          hasStopDesk: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as never,
      serviceFees: [],
      weightFees: [],
      lastSync: null,
    };

    const payload = buildUpdatePayload(
      {
        id: 11,
        fullName: 'Ada Lovelace',
        phoneNumber1: '0550123456',
        phoneNumber2: null,
        homeAddress: '12 Example street',
        city: '42',
        state: 16,
        totalAmount: 1250,
        note: 'Call first',
        orderProducts: [{ title: 'Chair', quantity: 2 }],
        delivery: 1,
      } as never,
      'TRK-11',
      catalog,
    );

    expect(payload).not.toHaveProperty('fragile');
    expect(payload).not.toHaveProperty('gps_link');
    expect(payload).toMatchObject({
      tracking: 'TRK-11',
      reference: '11',
      client: 'Ada Lovelace',
      tel: '0550123456',
      adresse: '12 Example street',
      code_postal: '1621',
      commune: 'Bab Ezzouar',
      wilaya: 16,
      montant: '1250',
      remarque: 'Call first',
      product: 'Chair x2',
      boutique: 'Bricomaitre',
      type: 1,
      stop_desk: 1,
    });
  });

  it('preserves known provider GPS and package values when editing a shipment', () => {
    const record = {
      id: 11,
      fullName: 'Ada',
      phoneNumber1: '0550000011',
      homeAddress: 'Street',
      city: 'Alger',
      state: 16,
      totalAmount: 1000,
      orderProducts: [],
      delivery: 0,
    } as never;
    const catalog = { wilayas: [], communes: [], serviceFees: [], weightFees: [], lastSync: null };
    const snapshot = { fragile: '1', gps_link: 'https://maps.google.com/?q=36.75,3.05' };
    expect(buildUpdatePayload(record, 'TRACK', catalog, snapshot)).toMatchObject({
      fragile: 1,
      gps_link: snapshot.gps_link,
    });
    expect(buildUpdatePayload(record, 'TRACK', catalog, { fragile: false })).toMatchObject({
      fragile: 0,
    });
    expect(
      buildUpdatePayload(record, 'TRACK', catalog, { fragile: 'unknown', gps_link: 'not a URL' }),
    ).not.toHaveProperty('gps_link');
  });

  it('allows office shipment edits without a home address', () => {
    expect(
      parseEcotrackShipmentUpdateDraft({
        firstName: 'Ada',
        lastName: 'Lovelace',
        phoneNumber1: '0550123456',
        phoneNumber2: null,
        delivery: 1,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: '',
        note: null,
      }),
    ).toMatchObject({
      delivery: 1,
      homeAddress: '',
    });
  });
  it('rejects amount prefixes, malformed decimals and non-finite carrier totals', () => {
    const draft = {
      firstName: 'Ada',
      phoneNumber1: '0550000011',
      delivery: 0,
      state: 16,
      city: 'Alger',
      homeAddress: 'Street',
    };
    for (const amount of ['12abc', '12.3.4', '1e3', '', '-1', Number.POSITIVE_INFINITY]) {
      expect(() =>
        parseEcotrackShipmentUpdateDraft({ ...draft, subtotalOverride: amount }),
      ).toThrow();
      expect(() => parseEcotrackShipmentUpdateDraft({ ...draft, deliveryFee: amount })).toThrow();
    }
    expect(
      parseEcotrackShipmentUpdateDraft({ ...draft, subtotalOverride: '1250.50', deliveryFee: '0' }),
    ).toMatchObject({ subtotalOverride: 1250.5, deliveryFee: 0 });
  });
});
