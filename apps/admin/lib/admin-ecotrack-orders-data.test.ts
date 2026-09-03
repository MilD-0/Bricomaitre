import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildUpdatePayload,
  deriveLatestUpstreamActivityAt,
  mapEcotrackOrderSnapshot,
  mapEcotrackStatusToOrderStatus,
  parseEcotrackProviderTimestamp,
  parseEcotrackShipmentUpdateDraft,
  resolveEcotrackStatusEvidence,
} from './admin-ecotrack-orders-data';
import type { EcotrackCatalogRecord } from './ecotrack';
import { getUpstreamTrackingValues } from './ecotrack-shipment-status';
import { localOrderCanRemainInCashPipeline } from './ecotrack-status-policy';

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

  it('keeps terminal local outcomes out of the active cash pipeline', () => {
    expect(localOrderCanRemainInCashPipeline(11)).toBe(true);
    expect(localOrderCanRemainInCashPipeline(4)).toBe(true);
    expect(localOrderCanRemainInCashPipeline(6)).toBe(false);
    expect(localOrderCanRemainInCashPipeline(8)).toBe(false);
    expect(localOrderCanRemainInCashPipeline(9)).toBe(false);
    expect(localOrderCanRemainInCashPipeline(10)).toBe(false);
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
    expect(fallbackActivity?.toISOString()).toBe('2026-03-05T00:00:00.000Z');

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

  it('builds update payloads with the fixed ECOTRACK-required fields', () => {
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
      fragile: 0,
      gps_link: 'https://www.google.com/maps',
    });
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
});
