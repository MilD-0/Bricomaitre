import { describe, expect, it } from 'vitest';

import { buildStorefrontContentSecurityPolicy } from './content-security-policy';

describe('Storefront content security policy', () => {
  it('keeps static rendering support without trusting arbitrary script origins', () => {
    const policy = buildStorefrontContentSecurityPolicy(['https://cdn.example.com'], {
      NODE_ENV: 'production',
    });

    expect(policy).toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toMatch(/script-src[^;]*https:/);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("img-src 'self' data: blob: https: https://cdn.example.com");
  });

  it('allows only configured marketing and diagnostic destinations', () => {
    const policy = buildStorefrontContentSecurityPolicy([], {
      NODE_ENV: 'production',
      NEXT_PUBLIC_FACEBOOK_PIXEL_ID: 'meta-id',
      NEXT_PUBLIC_GA_MEASUREMENT_ID: 'google-id',
      NEXT_PUBLIC_TIKTOK_PIXEL_ID: 'tiktok-id',
      NEXT_PUBLIC_SENTRY_DSN_STOREFRONT: 'https://public@example.ingest.sentry.io/42',
    });

    expect(policy).toContain('https://connect.facebook.net');
    expect(policy).toContain('https://www.googletagmanager.com');
    expect(policy).toContain('https://analytics.tiktok.com');
    expect(policy).toContain('https://example.ingest.sentry.io');
    expect(policy).not.toMatch(/script-src[^;]*\shttps:(?:;|\s)/);
    expect(policy).not.toMatch(/connect-src[^;]*\shttps:(?:;|\s)/);
  });
});
