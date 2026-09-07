import { describe, expect, it, vi } from 'vitest';

const withSentryConfig = vi.hoisted(() => vi.fn((config: unknown) => config));

vi.mock('next-intl/plugin', () => ({
  default: vi.fn(() => (config: unknown) => config),
}));

vi.mock('@sentry/nextjs/config', () => ({
  withSentryConfig,
}));

describe('admin Next configuration', () => {
  it('leaves page CSP to the nonce proxy and denies browser execution on APIs', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'build-token');
    vi.stubEnv('SENTRY_ORG', 'bricomaitre');
    vi.stubEnv('SENTRY_PROJECT_ADMIN', 'bricadmin');
    vi.stubEnv('SENTRY_RELEASE', 'commit-sha');
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
    expect(withSentryConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        authToken: 'build-token',
        org: 'bricomaitre',
        project: 'bricadmin',
        release: { name: 'commit-sha' },
        sourcemaps: expect.objectContaining({
          assets: expect.arrayContaining([
            expect.stringMatching(/dist[/]run-background-workers[.]cjs[.]map$/),
          ]),
          deleteSourcemapsAfterUpload: true,
        }),
        widenClientFileUpload: true,
      }),
    );
  });
});
