import { describe, expect, it, vi } from 'vitest';

const withSentryConfig = vi.hoisted(() => vi.fn((config: unknown) => config));

vi.mock('next-intl/plugin', () => ({
  default: vi.fn(() => (config: unknown) => config),
}));

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig,
}));

describe('storefront Next configuration', () => {
  it('enables modern routing, strict image, and security foundations without partial prerendering', async () => {
    process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS = 'http://cdn.example.com:4311';
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = 'meta-id';
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'google-id';
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = 'tiktok-id';
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'build-token');
    vi.stubEnv('SENTRY_ORG', 'bricomaitre');
    vi.stubEnv('SENTRY_PROJECT_STOREFRONT', 'storefront');
    vi.stubEnv('SENTRY_RELEASE', 'commit-sha');
    vi.resetModules();
    const { default: config } = await import('./next.config');

    expect(config).toMatchObject({
      output: 'standalone',
      typedRoutes: true,
      compress: false,
      cacheMaxMemorySize: 0,
      devIndicators: false,
      transpilePackages: ['@bric/runtime', '@bric/storefront-core'],
      allowedDevOrigins: expect.arrayContaining(['127.0.0.1']),
      experimental: {
        imgOptConcurrency: 1,
        imgOptOperationCache: false,
        imgOptSequentialRead: true,
      },
      images: {
        formats: ['image/webp'],
        qualities: [60, 75],
        maximumDiskCacheSize: 512_000_000,
        maximumResponseBody: 10 * 1024 * 1024,
        maximumRedirects: 0,
        remotePatterns: [expect.objectContaining({ hostname: 'cdn.example.com' })],
      },
    });
    expect(config).not.toHaveProperty('cacheComponents');
    const headerRules = await config.headers?.();
    expect(
      headerRules?.[0]?.headers.some((header) => header.key === 'Content-Security-Policy'),
    ).toBe(false);
    expect(headerRules?.[0]?.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ]),
    );
    expect(withSentryConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        authToken: 'build-token',
        org: 'bricomaitre',
        project: 'storefront',
        release: { name: 'commit-sha' },
        sourcemaps: { deleteSourcemapsAfterUpload: true },
        widenClientFileUpload: true,
      }),
    );
  });
});
