import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { getAdminHealthMock } = vi.hoisted(() => ({
  getAdminHealthMock: vi.fn(),
}));

vi.mock('../../../lib/health', () => ({
  getAdminHealth: getAdminHealthMock,
}));

describe('app/api/health/route', () => {
  beforeEach(() => {
    getAdminHealthMock.mockReset();
  });

  it('returns ok when local config, database, and storefront upstream are healthy', async () => {
    getAdminHealthMock.mockResolvedValue({
      ok: true,
      missingEnv: [],
      checks: {
        env: {
          databaseConfigured: true,
          authConfigured: true,
          uploadsConfigured: true,
          storefrontRevalidationConfigured: true,
        },
        database: { configured: true, ok: true, latencyMs: 4.1 },
        storefrontApi: {
          configured: true,
          ok: true,
          status: 200,
          latencyMs: 12.3,
          baseUrl: 'https://storefront-api.example.com',
        },
      },
    });

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'ok',
      service: 'admin',
      missingEnv: [],
      checks: expect.objectContaining({
        database: expect.objectContaining({
          ok: true,
        }),
        storefrontApi: expect.objectContaining({
          ok: true,
          status: 200,
          baseUrl: 'https://storefront-api.example.com',
        }),
      }),
    }));
  });

  it('returns degraded when local readiness or storefront health fails', async () => {
    getAdminHealthMock.mockResolvedValue({
      ok: false,
      missingEnv: ['STOREFRONT_REVALIDATE_SECRET'],
      checks: {
        env: {
          databaseConfigured: true,
          authConfigured: true,
          uploadsConfigured: true,
          storefrontRevalidationConfigured: false,
        },
        database: { configured: true, ok: false, latencyMs: 1500, error: 'database timed out after 1500ms' },
        storefrontApi: {
          configured: true,
          ok: false,
          status: 503,
          latencyMs: 18.6,
          baseUrl: 'https://storefront-api.example.com',
        },
      },
    });

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'degraded',
      missingEnv: ['STOREFRONT_REVALIDATE_SECRET'],
      checks: expect.objectContaining({
        database: expect.objectContaining({
          ok: false,
        }),
        storefrontApi: expect.objectContaining({
          ok: false,
          baseUrl: 'https://storefront-api.example.com',
        }),
      }),
    }));
  });
});
