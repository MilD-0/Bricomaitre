import { describe, expect, it, vi } from 'vitest';

describe('storefront cdn helpers', () => {
  it('returns null for an invalid cloudfront URL', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_CLOUDFRONT_URL = 'not-a-url';

    const { getCloudfrontOrigin } = await import('./cdn');

    expect(getCloudfrontOrigin()).toBeNull();
  });

  it('allows remote images from any http or https origin', async () => {
    vi.resetModules();

    const { getStorefrontRemoteImagePatterns } = await import('./cdn');

    expect(getStorefrontRemoteImagePatterns()).toEqual([
      {
        protocol: 'http',
        hostname: '**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ]);
  });

  it('returns a normalized asset prefix in production only', async () => {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_ASSET_PREFIX = 'https://cdn.example.com/_next/';

    const { getStorefrontAssetPrefix } = await import('./cdn');

    expect(getStorefrontAssetPrefix()).toBe('https://cdn.example.com/_next');
  });
});
