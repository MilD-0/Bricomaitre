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
  it('keeps the established local browser origins by default', async () => {
    const config = await loadConfig();
    const webServers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];

    expect(config.use?.baseURL).toBe('http://127.0.0.1:3003');
    expect(webServers).toHaveLength(2);
    expect(webServers[0]).toMatchObject({
      url: 'http://127.0.0.1:4311/api/health',
      env: {
        FIXTURE_API_ORIGIN: 'http://127.0.0.1:4311',
        PORT: '4311',
        STOREFRONT_ORIGIN: 'http://127.0.0.1:3003',
      },
    });
    expect(webServers[1]).toMatchObject({ url: 'http://127.0.0.1:3003/api/health' });
  });

  it('moves the performance stack to its dedicated CI origins', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_SERVER', 'production');
    vi.stubEnv('BRIC_PLAYWRIGHT_STOREFRONT_ORIGIN', 'http://127.0.0.1:3013');
    vi.stubEnv('BRIC_PLAYWRIGHT_UPSTREAM_ORIGIN', 'http://127.0.0.1:3014');
    vi.stubEnv('BRIC_PLAYWRIGHT_FIXTURE_API_ORIGIN', 'http://127.0.0.1:4321');

    const config = await loadConfig();
    const webServers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];

    expect(config.use?.baseURL).toBe('http://127.0.0.1:3013');
    expect(webServers).toHaveLength(3);
    expect(webServers[0]).toMatchObject({
      url: 'http://127.0.0.1:4321/api/health',
      env: {
        FIXTURE_API_ORIGIN: 'http://127.0.0.1:4321',
        PORT: '4321',
        STOREFRONT_ORIGIN: 'http://127.0.0.1:3013',
      },
    });
    expect(webServers[1]).toMatchObject({
      url: 'http://127.0.0.1:3014/api/health',
      env: {
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3013',
        PORT: '3014',
        STOREFRONT_API_BASE_URL: 'http://127.0.0.1:4321',
      },
    });
    expect(webServers[2]).toMatchObject({
      url: 'http://127.0.0.1:3013/api/health',
      env: { PORT: '3013', UPSTREAM_PORT: '3014' },
    });
  });

  it('starts an existing Storefront build for browser acceptance', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_SERVER', 'prebuilt');

    const config = await loadConfig();
    const webServers = Array.isArray(config.webServer) ? config.webServer : [config.webServer];

    expect(webServers).toHaveLength(3);
    expect(webServers[1]).toMatchObject({
      command: 'pnpm start',
      url: 'http://127.0.0.1:3004/api/health',
    });
    expect(webServers[2]).toMatchObject({
      url: 'http://127.0.0.1:3003/api/health',
    });
  });

  it('keeps design-baseline captures out of browser acceptance', async () => {
    const config = await loadConfig();
    const projects = config.projects ?? [];

    expect(projects.map((project) => project.name)).toEqual([
      'chromium',
      'mobile-iphone',
      'mobile-android',
      'design-baseline',
      'performance',
    ]);
    expect(projects.find((project) => project.name === 'chromium')?.testIgnore).toEqual([
      /browser\/mobile\/.*\.spec\.ts/,
      /browser\/design-baseline\.spec\.ts/,
    ]);
    expect(projects.find((project) => project.name === 'design-baseline')?.testMatch).toEqual(
      /browser\/design-baseline\.spec\.ts/,
    );
  });

  it('rejects non-loopback test origins', async () => {
    vi.stubEnv('BRIC_PLAYWRIGHT_STOREFRONT_ORIGIN', 'https://example.com:3013');

    await expect(loadConfig()).rejects.toThrow(
      'BRIC_PLAYWRIGHT_STOREFRONT_ORIGIN must be an HTTP 127.0.0.1 origin with an explicit port.',
    );
  });
});
