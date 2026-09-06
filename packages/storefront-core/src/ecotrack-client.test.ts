import { describe, expect, it, vi } from 'vitest';

import {
  EcotrackMutationRejectedError,
  getEcotrackOrder,
  getEcotrackTrackingsInfo,
  listEcotrackOrders,
  requestEcotrack,
  updateEcotrackOrder,
} from './ecotrack-client';

const env = {
  ECOTRACK_BASE_URL: 'https://ecotrack.example/api/v1',
  ECOTRACK_TOKEN: 'test-token',
  ECOTRACK_MIN_REQUEST_INTERVAL_MS: '0',
};

describe('getEcotrackOrder', () => {
  it('loads one documented current-order result with its authoritative status', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          current_page: 1,
          data: [
            {
              tracking: 'TRK-11',
              reference: '11',
              status: 'en_livraison',
              client: 'Example',
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await getEcotrackOrder('TRK-11', {
      startDate: '2026-05-01',
      fetchImpl,
      env,
    });

    expect(result.data).toMatchObject({ tracking: 'TRK-11', status: 'en_livraison' });
    const requestUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe('/api/v1/get/orders');
    expect(requestUrl.searchParams.get('tracking')).toBe('TRK-11');
    expect(requestUrl.searchParams.get('start_date')).toBe('2026-05-01');
    expect(requestUrl.searchParams.get('api_token')).toBe('test-token');
  });

  it('returns null when ECOTRACK no longer lists the requested shipment', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ current_page: 1, data: [], total: 0 }), { status: 200 }),
      );

    await expect(getEcotrackOrder('TRK-11', { fetchImpl, env })).resolves.toMatchObject({
      data: null,
    });
  });

  it('rejects malformed current-order statuses instead of treating them as evidence', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ tracking: 'TRK-11', status: '' }],
        }),
        { status: 200 },
      ),
    );

    await expect(getEcotrackOrder('TRK-11', { fetchImpl, env })).rejects.toThrow();
  });

  it('paginates the current-order feed and preserves provider fields outside the known contract', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            current_page: 1,
            last_page: 2,
            data: [
              {
                tracking: 'TRK-11',
                status: 'encaisse_non_paye',
                montant: '12700',
                tarif_prestation: '400',
                provider_new_field: 'retained',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            current_page: 2,
            last_page: 2,
            data: [{ tracking: 'TRK-12', status: 'paye_et_archive', montant: 9000 }],
          }),
          { status: 200 },
        ),
      );

    const result = await listEcotrackOrders({ fetchImpl, env, maxPages: 5 });

    expect(result.pagesFetched).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      tracking: 'TRK-11',
      montant: '12700',
      tarif_prestation: '400',
      provider_new_field: 'retained',
    });
    expect(result.rawData.get('TRK-11')).toMatchObject({ provider_new_field: 'retained' });
    expect(
      fetchImpl.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('page')),
    ).toEqual(['1', '2']);
  });

  it('normalizes undocumented OrderInfo from bulk tracking without dropping the raw payload', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          'TRK-11': {
            status: 'paye_et_archive',
            activity: [],
            OrderInfo: {
              tracking: 'TRK-11',
              reference: '11',
              montant: '12700',
              tarif_prestation: '400',
              stop_desk: false,
              provider_new_field: 'retained',
            },
            deliveryAttempts: [{ reason: 'No answer' }],
          },
        }),
        { status: 200 },
      ),
    );

    const result = await getEcotrackTrackingsInfo(['TRK-11'], { fetchImpl, env });

    expect(result.data.get('TRK-11')).toMatchObject({
      status: 'paye_et_archive',
      OrderInfo: {
        tracking: 'TRK-11',
        montant: '12700',
        tarif_prestation: '400',
        provider_new_field: 'retained',
      },
      deliveryAttempts: [{ reason: 'No answer' }],
    });
    expect(result.rawData.get('TRK-11')).toMatchObject({
      OrderInfo: { provider_new_field: 'retained' },
    });
  });
});

describe('carrier request outcomes', () => {
  const env = {
    NODE_ENV: 'test' as const,
    ECOTRACK_BASE_URL: 'https://carrier.example.invalid/api/v1',
    ECOTRACK_TOKEN: 'test',
    ECOTRACK_MIN_REQUEST_INTERVAL_MS: '0',
  };
  it('returns an accepted mutation even when that response exhausts the quota', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { success: true },
          { headers: { 'x-ratelimit-remaining-day': '0', 'x-ratelimit-remaining-hour': '0' } },
        ),
      );
    await expect(updateEcotrackOrder({ tracking: 'T' }, { fetchImpl, env })).resolves.toMatchObject(
      { success: true, rateLimit: { dayRemaining: 0, hourRemaining: 0 } },
    );
  });
  it('distinguishes explicit rejections from ambiguous successful HTTP responses', async () => {
    const rejected = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ success: false, message: 'Rejected' }));
    await expect(
      updateEcotrackOrder({ tracking: 'T' }, { fetchImpl: rejected, env }),
    ).rejects.toBeInstanceOf(EcotrackMutationRejectedError);
    const unknown = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ message: 'Unexpected response' }));
    await expect(
      updateEcotrackOrder({ tracking: 'T' }, { fetchImpl: unknown, env }),
    ).rejects.toThrow('unknown mutation outcome');
  });
  it('does not send an expired queued request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      requestEcotrack({
        path: '/create/orders',
        method: 'POST',
        fetchImpl,
        env,
        deadlineAt: Date.now() - 1,
      }),
    ).rejects.toThrow('deadline expired before sending');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
