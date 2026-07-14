import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: vi.fn(() => (config: unknown) => config),
}));

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: vi.fn((config: unknown) => config),
}));

describe('storefront-new Next configuration', () => {
  it('enables modern routing, cache, strict image, and security foundations', async () => {
    process.env.NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS = 'https://cdn.example.com';
    vi.resetModules();
    const { default: config } = await import('./next.config');

    expect(config).toMatchObject({
      output: 'standalone',
      cacheComponents: true,
      typedRoutes: true,
      images: {
        formats: ['image/avif', 'image/webp'],
        qualities: [60, 75],
        remotePatterns: [expect.objectContaining({ hostname: 'cdn.example.com' })],
      },
    });
    const headerRules = await config.headers?.();
    expect(headerRules?.[0]?.headers).toEqual(expect.arrayContaining([
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ]));
  });
});
