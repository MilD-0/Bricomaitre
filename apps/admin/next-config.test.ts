import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/plugin', () => ({
  default: vi.fn(() => (config: unknown) => config),
}));

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: vi.fn((config: unknown) => config),
}));

describe('admin Next configuration', () => {
  it('omits eval permission from the production content security policy', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { default: config } = await import('./next.config');

    const headerRules = await config.headers?.();
    const contentSecurityPolicy = headerRules?.[0]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;

    expect(contentSecurityPolicy).toContain("script-src 'self' 'unsafe-inline' https:");
    expect(contentSecurityPolicy).not.toContain("'unsafe-eval'");
  });
});
