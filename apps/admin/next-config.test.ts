import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: vi.fn(() => (config: unknown) => config),
}));

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: vi.fn((config: unknown) => config),
}));

describe('admin Next configuration', () => {
  it('leaves page CSP to the nonce proxy and denies browser execution on APIs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { default: config } = await import('./next.config');

    const headerRules = await config.headers?.();
    const pageContentSecurityPolicy = headerRules?.[0]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;
    const apiContentSecurityPolicy = headerRules?.[1]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;

    expect(pageContentSecurityPolicy).toBeUndefined();
    expect(apiContentSecurityPolicy).toContain("default-src 'none'");
    expect(apiContentSecurityPolicy).not.toContain('script-src');
  });
});
