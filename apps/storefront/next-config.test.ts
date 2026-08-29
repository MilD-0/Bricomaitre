import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: vi.fn(() => (config: unknown) => config),
}));

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: vi.fn((config: unknown) => config),
}));

describe('storefront Next configuration', () => {
  it('enables modern routing, strict image, and security foundations without partial prerendering', async () => {
    process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS = 'http://cdn.example.com:4311';
    process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = 'meta-id';
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'google-id';
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = 'tiktok-id';
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
    const contentSecurityPolicy = headerRules?.[0]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;
    expect(contentSecurityPolicy).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy).not.toMatch(/script-src[^;]*\shttps:(?:;|\s)/);
    expect(contentSecurityPolicy).toContain('https://connect.facebook.net');
    expect(contentSecurityPolicy).toContain('https://www.googletagmanager.com');
    expect(contentSecurityPolicy).toContain('https://analytics.tiktok.com');
    expect(headerRules?.[0]?.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        expect.objectContaining({
          key: 'Content-Security-Policy',
          value: expect.stringMatching(
            /frame-ancestors 'none'.*img-src[^;]*http:\/\/cdn\.example\.com:4311/,
          ),
        }),
      ]),
    );
  });
});
