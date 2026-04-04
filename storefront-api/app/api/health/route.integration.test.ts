import { beforeEach, describe, expect, it } from 'vitest';

import { GET } from './route';

describe('app/api/health/route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgres://example',
      REDIS_URL: 'redis://default:password@example.com:6379/0',
      ECOTRACK_BASE_URL: 'https://ecotrack.example.com/api',
      ECOTRACK_TOKEN: 'token',
    };
  });

  it('returns ok when required storefront-api env vars are configured', async () => {
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
      },
    }));
  });

  it('returns degraded when required env vars are missing', async () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    delete process.env.ECOTRACK_TOKEN;

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'degraded',
      missingEnv: ['REDIS_HOST', 'ECOTRACK_TOKEN'],
    }));
  });
});
