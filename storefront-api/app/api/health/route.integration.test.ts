import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { getStorefrontApiHealthMock } = vi.hoisted(() => ({
  getStorefrontApiHealthMock: vi.fn(),
}));

vi.mock('../../../lib/health', () => ({
  getStorefrontApiHealth: getStorefrontApiHealthMock,
}));

describe('app/api/health/route', () => {
  beforeEach(() => {
    getStorefrontApiHealthMock.mockReset();
  });

  it('returns ok when storefront-api dependencies are reachable', async () => {
    getStorefrontApiHealthMock.mockResolvedValue({
      ok: true,
      missingEnv: [],
      checks: {
        databaseConfigured: true,
        redisConfigured: true,
        ecotrackConfigured: true,
        revalidationConfigured: true,
        database: { configured: true, ok: true, latencyMs: 3.2 },
        redis: { configured: true, ok: true, latencyMs: 2.1 },
      },
    });

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'ok',
      service: 'storefront-api',
      missingEnv: [],
      checks: {
        databaseConfigured: true,
        redisConfigured: true,
        ecotrackConfigured: true,
        revalidationConfigured: true,
        database: { configured: true, ok: true, latencyMs: 3.2 },
        redis: { configured: true, ok: true, latencyMs: 2.1 },
      },
    }));
  });

  it('returns degraded when a dependency check fails', async () => {
    getStorefrontApiHealthMock.mockResolvedValue({
      ok: false,
      missingEnv: ['STOREFRONT_REVALIDATE_SECRET'],
      checks: {
        databaseConfigured: true,
        redisConfigured: true,
        ecotrackConfigured: true,
        revalidationConfigured: false,
        database: { configured: true, ok: true, latencyMs: 2.4 },
        redis: { configured: true, ok: false, latencyMs: 1500, error: 'redis timed out after 1500ms' },
      },
    });

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'degraded',
      missingEnv: ['STOREFRONT_REVALIDATE_SECRET'],
    }));
  });
});
