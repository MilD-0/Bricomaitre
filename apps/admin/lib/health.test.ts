import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getPoolMock, hasDbMock, getStorefrontApiBaseUrlMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  hasDbMock: vi.fn(),
  getStorefrontApiBaseUrlMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getPool: getPoolMock,
  hasDb: hasDbMock,
}));

vi.mock('./storefront-api', () => ({
  getStorefrontApiBaseUrl: getStorefrontApiBaseUrlMock,
}));

import { getAdminHealth } from './health';

describe('apps/admin/lib/health', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://example';
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    process.env.BETTER_AUTH_SECRET = 'secret';
    process.env.BETTER_AUTH_URL = 'https://admin.example.com';
    process.env.AWS_REGION = 'eu-west-3';
    process.env.AWS_S3_BUCKET = 'bucket';
    process.env.AWS_CLOUDFRONT_DOMAIN = 'cdn.example.com';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'secret';

    getPoolMock.mockReset();
    hasDbMock.mockReset();
    getStorefrontApiBaseUrlMock.mockReset();

    hasDbMock.mockReturnValue(true);
    getPoolMock.mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    });
    getStorefrontApiBaseUrlMock.mockReturnValue('https://storefront-api.example.com');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns ok when local db and storefront-api are healthy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 })),
    );

    const health = await getAdminHealth();

    expect(health.ok).toBe(true);
    expect(health.missingEnv).toEqual([]);
    expect(health.checks.database.ok).toBe(true);
    expect(health.checks.storefrontApi.ok).toBe(true);
  });

  it('returns degraded when the local database probe fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 })),
    );
    getPoolMock.mockReturnValue({ query: vi.fn().mockRejectedValue(new Error('database down')) });

    const health = await getAdminHealth();

    expect(health.ok).toBe(false);
    expect(health.checks.database.ok).toBe(false);
    expect(health.checks.database.error).toContain('database down');
  });
});
