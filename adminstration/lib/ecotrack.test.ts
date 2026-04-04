import { describe, expect, it, vi } from 'vitest';

import { cleanEcotrackEnvValue, fetchEcotrackCatalogSnapshot, getEcotrackConfig } from './ecotrack';

describe('lib/ecotrack', () => {
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
      { path: '/get/wilayas', limit: 50, remaining: 47, reset: null },
      { path: '/get/communes', limit: 50, remaining: 46, reset: null },
      { path: '/get/fees', limit: 50, remaining: 45, reset: null },
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
});
