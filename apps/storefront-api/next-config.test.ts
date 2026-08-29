import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  withSentryConfig: vi.fn((config: unknown) => config),
}));

describe('storefront API Next configuration', () => {
  it('does not grant browser execution permissions to JSON responses', async () => {
    const { default: config } = await import('./next.config');
    const headerRules = await config.headers?.();
    const policy = headerRules?.[0]?.headers.find(
      (header) => header.key === 'Content-Security-Policy',
    )?.value;

    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toContain('script-src');
    expect(policy).not.toContain('connect-src');
  });
});
