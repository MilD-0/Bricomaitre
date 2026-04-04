import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

describe('app/api/health/route', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgres://example',
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CLIENT_SECRET: 'google-client-secret',
      NEXTAUTH_SECRET: 'secret',
      AWS_REGION: 'eu-west-3',
      AWS_S3_BUCKET: 'bucket',
      AWS_CLOUDFRONT_DOMAIN: 'cdn.example.com',
      STOREFRONT_API_BASE_URL: 'https://storefront-api.example.com',
    };
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it('returns ok when local config and storefront upstream are healthy', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'ok',
      service: 'admin',
      missingEnv: [],
      checks: expect.objectContaining({
        storefrontApi: expect.objectContaining({
          ok: true,
          status: 200,
          baseUrl: 'https://storefront-api.example.com',
        }),
      }),
    }));
  });

  it('returns degraded when required env vars are missing or storefront is unavailable', async () => {
    delete process.env.AWS_S3_BUCKET;
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const response = await GET(new Request('http://localhost/api/health'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: 'degraded',
      missingEnv: ['AWS_S3_BUCKET'],
      checks: expect.objectContaining({
        storefrontApi: expect.objectContaining({
          ok: false,
          baseUrl: 'https://storefront-api.example.com',
        }),
      }),
    }));
  });
});
