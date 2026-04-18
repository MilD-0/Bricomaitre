import { afterEach, describe, expect, it, vi } from 'vitest';

import { ecotrackOrderStates } from '../db/schema';
import {
  buildEcotrackOrderPayload,
  classifyOrdersForEcotrackPosting,
  cleanEcotrackEnvValue,
  createEcotrackOrdersBatch,
  fetchEcotrackCatalogSnapshot,
  getEcotrackConfig,
  postOrdersToEcotrack,
  validateEcotrackToken,
  type EcotrackCatalogRecord,
  type EcotrackOrderInput,
} from './ecotrack';

describe('lib/ecotrack', () => {
  const env = {
    ECOTRACK_BASE_URL: 'https://example.com/api/v1',
    ECOTRACK_TOKEN: 'secret-token',
  } as unknown as NodeJS.ProcessEnv;

  const catalog: EcotrackCatalogRecord = {
    wilayas: [{ wilayaId: 16, name: 'Alger', createdAt: new Date(), updatedAt: new Date() }] as never,
    communes: [{ communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true, createdAt: new Date(), updatedAt: new Date() }] as never,
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
    confirmed: 2,
  } as never;

  const orderInput: EcotrackOrderInput = {
    row: {
      id: 11,
      ecotrackReference: null,
      ecotrackTrackingNumber: null,
      confirmedAt: null,
      confirmedBy: null,
      confirmedByName: null,
    } as never,
    record: orderRecord,
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('cleans malformed env values', () => {
    expect(cleanEcotrackEnvValue(' "https://example.com/api/v1", ')).toBe('https://example.com/api/v1');
    expect(cleanEcotrackEnvValue(" 'token-value',")).toBe('token-value');
  });

  it('reads sanitized config values', () => {
    expect(getEcotrackConfig({
      ECOTRACK_BASE_URL: ' "https://example.com/api/v1", ',
      ECOTRACK_TOKEN: ' "secret-token", ',
    } as unknown as NodeJS.ProcessEnv)).toEqual({
      baseUrl: 'https://example.com/api/v1',
      token: 'secret-token',
    });
  });

  it('normalizes the ECOTRACK catalog snapshot', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { wilaya_id: 16, wilaya_name: 'Alger' },
      ]), {
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '50',
          'x-ratelimit-remaining': '47',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        42: {
          nom: 'Bab Ezzouar',
          wilaya_id: 16,
          code_postal: '1621',
          has_stop_desk: 1,
        },
      }), {
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '50',
          'x-ratelimit-remaining': '46',
        },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        livraison: [{ wilaya_id: 16, tarif: '400', tarif_stopdesk: '350' }],
        pickup: [{ wilaya_id: 16, tarif: '400', tarif_stopdesk: '350' }],
        echange: [{ wilaya_id: 16, tarif: '400', tarif_stopdesk: '350' }],
        recouvrement: [{ wilaya_id: 16, tarif: '400', tarif_stopdesk: '350' }],
        retours: [{ wilaya_id: 16, tarif: '0', tarif_stopdesk: '0' }],
        poids: {
          livraison: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          pickup: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          echange: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          recouvrement: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
        },
      }), {
        headers: {
          'content-type': 'application/json',
          'x-ratelimit-limit': '50',
          'x-ratelimit-remaining': '45',
        },
      }));

    const snapshot = await fetchEcotrackCatalogSnapshot({
      fetchImpl,
      env: {
        ECOTRACK_BASE_URL: 'https://example.com/api/v1',
        ECOTRACK_TOKEN: 'secret-token',
      } as unknown as NodeJS.ProcessEnv,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(snapshot.wilayas).toEqual([{ wilayaId: 16, name: 'Alger' }]);
    expect(snapshot.communes).toEqual([{
      communeId: 42,
      wilayaId: 16,
      name: 'Bab Ezzouar',
      postalCode: '1621',
      hasStopDesk: true,
    }]);
    expect(snapshot.serviceFees).toHaveLength(5);
    expect(snapshot.weightFees).toHaveLength(4);
    expect(snapshot.rateLimits).toEqual([
      {
        path: '/get/wilayas',
        limit: 50,
        remaining: 47,
        reset: null,
        minuteLimit: 50,
        minuteRemaining: 47,
        minuteReset: null,
        hourLimit: null,
        hourRemaining: null,
        hourReset: null,
        dayLimit: null,
        dayRemaining: null,
        dayReset: null,
        retryAfterSeconds: null,
      },
      {
        path: '/get/communes',
        limit: 50,
        remaining: 46,
        reset: null,
        minuteLimit: 50,
        minuteRemaining: 46,
        minuteReset: null,
        hourLimit: null,
        hourRemaining: null,
        hourReset: null,
        dayLimit: null,
        dayRemaining: null,
        dayReset: null,
        retryAfterSeconds: null,
      },
      {
        path: '/get/fees',
        limit: 50,
        remaining: 45,
        reset: null,
        minuteLimit: 50,
        minuteRemaining: 45,
        minuteReset: null,
        hourLimit: null,
        hourRemaining: null,
        hourReset: null,
        dayLimit: null,
        dayRemaining: null,
        dayReset: null,
        retryAfterSeconds: null,
      },
    ]);
  });

  it('rejects invalid commune payloads', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ wilaya_id: 16, wilaya_name: 'Alger' }]), {
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ nom: 'Bab Ezzouar' }]), {
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        livraison: [],
        pickup: [],
        echange: [],
        recouvrement: [],
        retours: [],
        poids: {
          livraison: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          pickup: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          echange: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          recouvrement: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
        },
      }), {
        headers: { 'content-type': 'application/json' },
      }));

    await expect(fetchEcotrackCatalogSnapshot({
      fetchImpl,
      env: {
        ECOTRACK_BASE_URL: 'https://example.com/api/v1',
        ECOTRACK_TOKEN: 'secret-token',
      } as unknown as NodeJS.ProcessEnv,
    })).rejects.toThrow();
  });

  it('backfills missing wilayas referenced by communes', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { wilaya_id: 16, wilaya_name: 'Alger' },
      ]), {
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        42: {
          nom: 'Bab Ezzouar',
          wilaya_id: 16,
          code_postal: '1621',
          has_stop_desk: 1,
        },
        5001: {
          nom: 'In Salah',
          wilaya_id: 50,
          code_postal: '5001',
          has_stop_desk: 1,
        },
      }), {
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        livraison: [{ wilaya_id: 16, tarif: '400', tarif_stopdesk: '350' }],
        pickup: [{ wilaya_id: 16, tarif: '400', tarif_stopdesk: '350' }],
        echange: [{ wilaya_id: 16, tarif: '400', tarif_stopdesk: '350' }],
        recouvrement: [{ wilaya_id: 16, tarif: '400', tarif_stopdesk: '350' }],
        retours: [{ wilaya_id: 16, tarif: '0', tarif_stopdesk: '0' }],
        poids: {
          livraison: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          pickup: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          echange: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
          recouvrement: {
            surfacturation_a_domicile_DA: '50',
            surfacturation_stopdesk_DA: '50',
            pour_chaque_KG: '1.00',
            a_partir_de_KG: '5.00',
          },
        },
      }), {
        headers: { 'content-type': 'application/json' },
      }));

    const snapshot = await fetchEcotrackCatalogSnapshot({
      fetchImpl,
      env: {
        ECOTRACK_BASE_URL: 'https://example.com/api/v1',
        ECOTRACK_TOKEN: 'secret-token',
      } as unknown as NodeJS.ProcessEnv,
    });

    expect(snapshot.wilayas).toEqual([
      { wilayaId: 16, name: 'Alger' },
      { wilayaId: 50, name: 'In Salah' },
    ]);
  });

  it('parses extended rate-limit headers during token validation', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      headers: {
        'content-type': 'application/json',
        'x-ratelimit-limit': '50',
        'x-ratelimit-remaining': '44',
        'x-ratelimit-reset': '1710000000',
        'x-ratelimit-limit-hour': '500',
        'x-ratelimit-remaining-hour': '490',
        'x-ratelimit-reset-hour': '1710003600',
        'x-ratelimit-limit-day': '2500',
        'x-ratelimit-remaining-day': '2490',
        'x-ratelimit-reset-day': '1710086400',
      },
    }));

    const result = await validateEcotrackToken({ fetchImpl, env });

    expect(result.success).toBe(true);
    expect(result.rateLimit).toMatchObject({
      minuteLimit: 50,
      minuteRemaining: 44,
      minuteReset: 1710000000,
      hourLimit: 500,
      hourRemaining: 490,
      hourReset: 1710003600,
      dayLimit: 2500,
      dayRemaining: 2490,
      dayReset: 1710086400,
    });
  });

  it('honors Retry-After on successful token validation', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      headers: {
        'content-type': 'application/json',
        'retry-after': '2',
      },
    }));

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
    const result = classifyOrdersForEcotrackPosting([
      orderInput,
      {
        row: { ...orderInput.row, id: 12, ecotrackTrackingNumber: 'TRK-12' } as never,
        record: { ...orderRecord, id: 12, fullName: 'Grace Hopper' } as never,
      },
      {
        row: { ...orderInput.row, id: 13 } as never,
        record: { ...orderRecord, id: 13, phoneNumber1: null } as never,
      },
    ], catalog);

    expect(result.totalRequested).toBe(3);
    expect(result.eligible).toHaveLength(1);
    expect(result.skipped).toEqual([{ orderId: 12, customerName: 'Grace Hopper', reason: 'already_posted' }]);
    expect(result.invalid).toEqual([expect.objectContaining({ orderId: 13, reason: 'missing_phone' })]);
  });

  it('allows stop desk orders without a home address', () => {
    const result = classifyOrdersForEcotrackPosting([
      {
        row: { ...orderInput.row, id: 14 } as never,
        record: { ...orderRecord, id: 14, delivery: 1, homeAddress: null } as never,
      },
    ], catalog);

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
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      results: {
        0: { success: true, tracking: 'TRK-11' },
      },
    }), {
      headers: {
        'content-type': 'application/json',
      },
    }));

    const result = await createEcotrackOrdersBatch([buildEcotrackOrderPayload(orderRecord, catalog)], { fetchImpl, env });

    expect(result.results.get('11')).toEqual({
      success: true,
      tracking: 'TRK-11',
      message: null,
      raw: { success: true, tracking: 'TRK-11' },
    });
  });

  it('parses create failures from message and errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      results: {
        0: { success: false, message: 'Invalid order', errors: { telephone: ['Phone is required'] } },
      },
    }), {
      headers: {
        'content-type': 'application/json',
      },
    }));

    const result = await createEcotrackOrdersBatch([buildEcotrackOrderPayload(orderRecord, catalog)], { fetchImpl, env });

    expect(result.results.get('11')).toEqual({
      success: false,
      tracking: null,
      message: 'Invalid order',
      raw: { success: false, message: 'Invalid order', errors: { telephone: ['Phone is required'] } },
    });
  });

  it('posts orders without a validate phase and returns a create-only summary', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), {
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: {
          0: { success: true, tracking: 'TRK-11', message: 'Created successfully.' },
        },
      }), {
        headers: { 'content-type': 'application/json' },
      }));

    const updateSetMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const upsertValuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) });
    const actionLogValuesMock = vi.fn().mockResolvedValue(undefined);
    const db = {
      transaction: async (callback: (tx: Record<string, unknown>) => Promise<void>) => callback({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({ set: updateSetMock }),
        insert: vi.fn((table: unknown) => table === ecotrackOrderStates
          ? { values: upsertValuesMock }
          : { values: actionLogValuesMock }),
      }),
    } as never;

    const summary = await postOrdersToEcotrack(db, [orderInput], catalog, { email: 'ops@example.com', name: 'Ops' }, { fetchImpl, env });

    expect(summary).toMatchObject({
      totalRequested: 1,
      eligible: 1,
      created: 1,
      skippedAlreadyPosted: 0,
      invalid: 0,
      failed: 0,
    });
    expect(summary).not.toHaveProperty('validated');
    expect(summary.results).toEqual([
      expect.objectContaining({ orderId: 11, status: 'created', tracking: 'TRK-11' }),
    ]);
  });
});
