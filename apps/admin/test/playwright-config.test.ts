import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfig() {
  vi.resetModules();
  return (await import('../playwright.config')).default;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Playwright server isolation', () => {
  it('owns the established loopback development origin by default', async () => {
    const config = await loadConfig();

    expect(config.use?.baseURL).toBe('http://127.0.0.1:3000');
    expect(config.webServer).toMatchObject({
      command: 'pnpm dev --hostname 127.0.0.1',
      url: 'http://127.0.0.1:3000/api/auth/get-session',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        BETTER_AUTH_URL: 'http://127.0.0.1:3000',
        PORT: '3000',
      },
    });
  });

  it('moves the Admin server and authentication origin together', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_ADMIN_ORIGIN', 'http://127.0.0.1:3020');

    const config = await loadConfig();

    expect(config.use?.baseURL).toBe('http://127.0.0.1:3020');
    expect(config.webServer).toMatchObject({
      url: 'http://127.0.0.1:3020/api/auth/get-session',
      reuseExistingServer: false,
      env: {
        BETTER_AUTH_URL: 'http://127.0.0.1:3020',
        PORT: '3020',
      },
    });
  });

  it('rejects non-loopback test origins', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_ADMIN_ORIGIN', 'https://example.com:3020');

    await expect(loadConfig()).rejects.toThrow(
      'BRIC_PLAYWRIGHT_ADMIN_ORIGIN must be an HTTP 127.0.0.1 origin with an explicit port.',
    );
  });
});
