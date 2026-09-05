import { describe, expect, it } from 'vitest';

import {
  ADMIN_API_CONTENT_SECURITY_POLICY,
  buildAdminPageContentSecurityPolicy,
} from './content-security-policy';

describe('Admin content security policy', () => {
  it('uses a per-request script nonce without broad script origins in production', () => {
    const policy = buildAdminPageContentSecurityPolicy('nonce-value', {
      NODE_ENV: 'production',
      NEXT_PUBLIC_SENTRY_DSN_ADMIN: 'https://public@example.ingest.sentry.io/42',
    });

    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(policy).not.toMatch(/script-src[^;]*https:/);
    expect(policy).toContain("connect-src 'self' https://example.ingest.sentry.io");
  });

  it('does not trust malformed or non-TLS diagnostic destinations', () => {
    expect(
      buildAdminPageContentSecurityPolicy('nonce-value', {
        NODE_ENV: 'production',
        NEXT_PUBLIC_SENTRY_DSN_ADMIN: 'http://diagnostics.example.com/42',
      }),
    ).toContain("connect-src 'self'");
    expect(
      buildAdminPageContentSecurityPolicy('nonce-value', {
        NODE_ENV: 'production',
        NEXT_PUBLIC_SENTRY_DSN_ADMIN: 'not a URL',
      }),
    ).not.toContain('not a URL');
  });

  it('allows only an explicit loopback image origin in demo mode', () => {
    expect(
      buildAdminPageContentSecurityPolicy('nonce-value', {
        NODE_ENV: 'production',
        BRIC_DEMO_MODE: 'true',
        BRIC_DEMO_OBJECT_ORIGIN: 'http://127.0.0.1:3900',
      }),
    ).toContain("img-src 'self' data: blob: https: http://127.0.0.1:3900");
    expect(
      buildAdminPageContentSecurityPolicy('nonce-value', {
        NODE_ENV: 'production',
        BRIC_DEMO_MODE: 'true',
        BRIC_DEMO_OBJECT_ORIGIN: 'http://objects.example.com',
      }),
    ).not.toContain('objects.example.com');
  });

  it('gives JSON API responses no browser execution surface', () => {
    expect(ADMIN_API_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(ADMIN_API_CONTENT_SECURITY_POLICY).not.toContain('script-src');
  });
});
