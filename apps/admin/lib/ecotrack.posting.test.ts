import {
  classifyOrdersForEcotrackPosting,
  validateEcotrackToken,
} from './ecotrack-posting/preview';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildEcotrackOrderPayload,
  createEcotrackOrdersBatch,
  type EcotrackCatalogRecord,
  type EcotrackOrderInput,
} from './ecotrack';

describe('lib/ecotrack', () => {
  const env = {
    ECOTRACK_BASE_URL: 'https://example.com/api/v1',
    ECOTRACK_TOKEN: 'secret-token',
  } as unknown as NodeJS.ProcessEnv;

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

  const orderRecord = {
    id: 11,
    fullName: 'Ada Lovelace',
    phoneNumber1: '550123456',
    phoneNumber2: '660123456',
    homeAddress: '12 Example street',
    city: '42',
    state: 16,
    totalAmount: 1250,
    note: 'Call first',
    orderProducts: [{ title: 'Chair', quantity: 2 }],
    delivery: 1,
    inHouseStatus: 2,
  } as EcotrackOrderInput['record'];

  const orderInput: EcotrackOrderInput = {
    row: {
      id: 11,
      ecotrackReference: null,
      ecotrackTrackingNumber: null,
      inHouseStatus: 2,
      noAnswerCount: 0,
      confirmedAt: null,
      confirmedBy: null,
      confirmedByName: null,
    } as EcotrackOrderInput['row'],
    record: orderRecord,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('honors Retry-After on successful token validation', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        headers: {
          'content-type': 'application/json',
          'retry-after': '2',
        },
      }),
    );

    const promise = validateEcotrackToken({ fetchImpl, env });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(resolved).toBe(true);
  });

  it.each(['+213 550 12 34 56', '00213 550 12 34 56', '0550 12 34 56', '550123456', '٠٥٥٠١٢٣٤٥٦'])(
    'posts %s using the domestic carrier phone format',
    (phoneNumber1) => {
      expect(buildEcotrackOrderPayload({ ...orderRecord, phoneNumber1 }, catalog).telephone).toBe(
        '0550123456',
      );
    },
  );

  it('maps orders to Ecotrack payloads using synced commune data', () => {
    expect(buildEcotrackOrderPayload(orderRecord, catalog)).toEqual({
      reference: '11',
      nom_client: 'Ada Lovelace',
      telephone: '0550123456',
      telephone_2: '0660123456',
      adresse: '12 Example street',
      code_postal: '1621',
      commune: 'Bab Ezzouar',
      code_wilaya: '16',
      montant: '1250',
      remarque: 'Call first',
      produit: 'Chair x2',
      type: '1',
      stop_desk: 1,
    });
  });

  it('classifies already-posted and invalid orders', () => {
    const result = classifyOrdersForEcotrackPosting(
      [
        orderInput,
        {
          row: { ...orderInput.row, id: 12, ecotrackTrackingNumber: 'TRK-12' },
          record: { ...orderRecord, id: 12, fullName: 'Grace Hopper' },
        },
        {
          row: { ...orderInput.row, id: 13 },
          record: { ...orderRecord, id: 13, phoneNumber1: '' },
        },
      ],
      catalog,
    );

    expect(result.totalRequested).toBe(3);
    expect(result.eligible).toHaveLength(1);
    expect(result.skipped).toEqual([
      { orderId: 12, customerName: 'Grace Hopper', reason: 'already_posted' },
    ]);
    expect(result.invalid).toEqual([
      expect.objectContaining({ orderId: 13, reason: 'missing_phone' }),
    ]);
  });

  it('allows stop desk orders without a home address', () => {
    const result = classifyOrdersForEcotrackPosting(
      [
        {
          row: { ...orderInput.row, id: 14 },
          record: { ...orderRecord, id: 14, delivery: 1, homeAddress: null },
        },
      ],
      catalog,
    );

    expect(result.invalid).toEqual([]);
    expect(result.eligible).toEqual([
      expect.objectContaining({
        orderId: 14,
        payload: expect.objectContaining({
          adresse: 'Adresse non renseignee',
          stop_desk: 1,
        }),
      }),
    ]);
  });

  it('normalizes batch create results keyed by batch index', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            0: { success: true, tracking: 'TRK-11' },
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const result = await createEcotrackOrdersBatch(
      [buildEcotrackOrderPayload(orderRecord, catalog)],
      { fetchImpl, env },
    );

    expect(result.results.get('11')).toEqual({
      success: true,
      tracking: 'TRK-11',
      message: null,
      raw: { success: true, tracking: 'TRK-11' },
    });
  });

  it('parses create failures from message and errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            0: {
              success: false,
              message: 'Invalid order',
              errors: { telephone: ['Phone is required'] },
            },
          },
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const result = await createEcotrackOrdersBatch(
      [buildEcotrackOrderPayload(orderRecord, catalog)],
      { fetchImpl, env },
    );

    expect(result.results.get('11')).toEqual({
      success: false,
      tracking: null,
      message: 'Invalid order',
      raw: {
        success: false,
        message: 'Invalid order',
        errors: { telephone: ['Phone is required'] },
      },
    });
  });
});
