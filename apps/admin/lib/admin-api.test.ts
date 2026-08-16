import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, requestJson } from './admin-api';

describe('requestJson', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed JSON and sets the content type for a request body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      requestJson<{ ok: boolean }>('/api/example', {
        method: 'POST',
        body: JSON.stringify({ value: 1 }),
      }),
    ).resolves.toEqual({ ok: true });

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(expect.any(Headers));
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get('content-type')).toBe(
      'application/json',
    );
  });

  it('preserves a structured API error and its status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { field: ['Invalid'] } }), {
          status: 400,
          statusText: 'Bad Request',
        }),
      ),
    );

    const error = await requestJson('/api/example').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ status: 400, message: JSON.stringify({ field: ['Invalid'] }) });
  });

  it('uses a plain response body when the failure is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Upstream unavailable', { status: 502 })),
    );

    await expect(requestJson('/api/example')).rejects.toMatchObject({
      status: 502,
      message: 'Upstream unavailable',
    });
  });

  it('supports minimal json-only fetch doubles used by component tests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: vi.fn().mockResolvedValue({ ok: true }),
      }),
    );

    await expect(requestJson('/api/example')).resolves.toEqual({ ok: true });
  });
});
