import { describe, expect, it, vi } from 'vitest';

const withSentryConfig = vi.hoisted(() => vi.fn((config: unknown) => config));

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig,
}));

describe('storefront API Next configuration', () => {
  it('does not grant browser execution permissions to JSON responses', async () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'build-token');
    vi.stubEnv('SENTRY_ORG', 'bricomaitre');
    vi.stubEnv('SENTRY_PROJECT_STOREFRONT_API', 'brico-api');
    vi.stubEnv('SENTRY_RELEASE', 'commit-sha');
    vi.resetModules();
    const { default: config } = await import('./next.config');
    const headerRules = await config.headers?.();
    const policy = headerRules?.[0]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;

    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('script-src');
    expect(policy).not.toContain('connect-src');
    expect(withSentryConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        authToken: 'build-token',
        org: 'bricomaitre',
        project: 'brico-api',
        release: { name: 'commit-sha' },
        sourcemaps: expect.objectContaining({
          assets: expect.arrayContaining([
            expect.stringMatching(/dist[/]run-meta-worker[.]cjs[.]map$/),
          ]),
          deleteSourcemapsAfterUpload: true,
        }),
        widenClientFileUpload: true,
      }),
    );
  });
});
