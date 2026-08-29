import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildHealthPayload, getStorefrontHealth } from './health';

describe('storefront health', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('reports readiness when the canonical API is healthy', async () => {
    vi.stubEnv('STOREFRONT_API_BASE_URL', 'https://storefront-api.example.com');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getStorefrontHealth()).resolves.toMatchObject({
      ok: true,
      upstream: { ok: true, status: 200 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://storefront-api.example.com/api/health',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('reports degraded readiness when the canonical API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    await expect(getStorefrontHealth()).resolves.toMatchObject({
      ok: false,
      upstream: { ok: false, status: null },
    });
    expect(buildHealthPayload(false)).toEqual({
      status: 'degraded',
      app: 'storefront',
    });
  });

  it('keeps the public healthy payload stable', () => {
    expect(buildHealthPayload(true)).toEqual({
      status: 'ok',
      app: 'storefront',
    });
  });
});
