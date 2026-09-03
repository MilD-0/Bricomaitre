import { describe, expect, it } from 'vitest';

import { buildStorefrontContentSecurityPolicy } from './content-security-policy';

describe('Storefront content security policy', () => {
  it('requires a per-request nonce without trusting arbitrary script origins', () => {
    const policy = buildStorefrontContentSecurityPolicy(
      ['https://cdn.example.com'],
      'request-nonce',
      { NODE_ENV: 'production' },
    );

    expect(policy).toContain("script-src 'self' 'nonce-request-nonce' 'strict-dynamic'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).not.toMatch(/script-src[^;]*https:/);
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).toContain("img-src 'self' data: blob: https: https://cdn.example.com");
  });

  it('allows only configured marketing and diagnostic destinations', () => {
    const policy = buildStorefrontContentSecurityPolicy([], 'request-nonce', {
      NODE_ENV: 'production',
      NEXT_PUBLIC_FACEBOOK_PIXEL_ID: 'meta-id',
      NEXT_PUBLIC_SENTRY_DSN_STOREFRONT: 'https://public@example.ingest.sentry.io/42',
    });

    expect(policy).toContain('https://connect.facebook.net');
    expect(policy).not.toContain('https://www.googletagmanager.com');
    expect(policy).not.toContain('https://www.google-analytics.com');
    expect(policy).not.toContain('https://analytics.tiktok.com');
    expect(policy).toContain('https://example.ingest.sentry.io');
    expect(policy).not.toMatch(/script-src[^;]*\shttps:(?:;|\s)/);
    expect(policy).not.toMatch(/connect-src[^;]*\shttps:(?:;|\s)/);
  });
});
