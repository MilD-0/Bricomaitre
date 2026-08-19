import { describe, expect, it, vi } from 'vitest';

import { getEcotrackOrder } from './ecotrack-client';

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
});
