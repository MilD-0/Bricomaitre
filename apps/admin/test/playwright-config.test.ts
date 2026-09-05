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

    expect(config.use?.baseURL).toBe('http://localhost:3000');
    expect(config.webServer).toMatchObject({
      command: 'pnpm dev --hostname 127.0.0.1',
      url: 'http://127.0.0.1:3000/android-chrome-192x192.png',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        BETTER_AUTH_URL: 'http://localhost:3000',
        PORT: '3000',
      },
    });
  });

  it('moves the Admin server and authentication origin together', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_ADMIN_ORIGIN', 'http://127.0.0.1:3020');

    const config = await loadConfig();

    expect(config.use?.baseURL).toBe('http://127.0.0.1:3020');
    expect(config.webServer).toMatchObject({
      command: 'pnpm dev --hostname 127.0.0.1',
      url: 'http://127.0.0.1:3020/android-chrome-192x192.png',
      reuseExistingServer: false,
      env: {
        BETTER_AUTH_URL: 'http://127.0.0.1:3020',
        PORT: '3020',
      },
    });
  });

  it('keeps design-baseline captures out of browser acceptance', async () => {
    const config = await loadConfig();
    const projects = config.projects ?? [];

    expect(projects.map((project) => project.name)).toEqual([
      'chromium',
      'mobile-chromium',
      'design-baseline',
    ]);
    expect(projects.find((project) => project.name === 'chromium')?.testIgnore).toEqual(
      /design-baseline\.spec\.ts/,
    );
    expect(projects.find((project) => project.name === 'mobile-chromium')?.testIgnore).toEqual(
      /design-baseline\.spec\.ts/,
    );
    expect(projects.find((project) => project.name === 'design-baseline')?.testMatch).toEqual(
      /design-baseline\.spec\.ts/,
    );
  });

  it('runs the built application on the same isolated origin for CI acceptance', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_SERVER', 'prebuilt');
    vi.stubEnv('BRIC_PLAYWRIGHT_ADMIN_ORIGIN', 'http://127.0.0.1:3020');

    const config = await loadConfig();

    expect(config.webServer).toMatchObject({
      command: 'pnpm start',
      url: 'http://127.0.0.1:3020/android-chrome-192x192.png',
      reuseExistingServer: false,
      env: { HOSTNAME: '127.0.0.1', PORT: '3020', BETTER_AUTH_URL: 'http://127.0.0.1:3020' },
    });
  });

  it('rejects non-loopback test origins', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_ADMIN_ORIGIN', 'https://example.com:3020');

    await expect(loadConfig()).rejects.toThrow(
      'BRIC_PLAYWRIGHT_ADMIN_ORIGIN must be an HTTP localhost or 127.0.0.1 origin with an explicit port.',
    );
  });

  it('rejects wildcard bind addresses as browser origins', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_ADMIN_ORIGIN', 'http://0.0.0.0:3020');

    await expect(loadConfig()).rejects.toThrow(
      'BRIC_PLAYWRIGHT_ADMIN_ORIGIN must be an HTTP localhost or 127.0.0.1 origin with an explicit port.',
    );
  });
});
