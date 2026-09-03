import { defineConfig, devices } from '@playwright/test';

const playwrightServerMode = process.env.BRIC_PLAYWRIGHT_SERVER;
const useProductionServer =
  playwrightServerMode === 'production' || playwrightServerMode === 'prebuilt';
const usePrebuiltProductionServer = playwrightServerMode === 'prebuilt';

function readLoopbackOrigin(name: string, fallback: string) {
  const origin = new URL(process.env[name] ?? fallback);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port) {
    throw new Error(`${name} must be an HTTP 127.0.0.1 origin with an explicit port.`);
  }
  return origin.origin;
}

const storefrontOrigin = readLoopbackOrigin(
  'BRIC_PLAYWRIGHT_STOREFRONT_ORIGIN',
  'http://127.0.0.1:3003',
);
const upstreamOrigin = readLoopbackOrigin(
  'BRIC_PLAYWRIGHT_UPSTREAM_ORIGIN',
  'http://127.0.0.1:3004',
);
const fixtureApiOrigin = readLoopbackOrigin(
  'BRIC_PLAYWRIGHT_FIXTURE_API_ORIGIN',
  'http://127.0.0.1:4311',
);
const storefrontPort = new URL(storefrontOrigin).port;
const upstreamPort = new URL(upstreamOrigin).port;
const fixtureApiPort = new URL(fixtureApiOrigin).port;
const nextServerPort = useProductionServer ? upstreamPort : storefrontPort;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['line'],
        ['junit', { outputFile: 'test-results/playwright-junit.xml' }],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ]
    : 'list',
  use: {
    baseURL: storefrontOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /browser\/.*\.spec\.ts/,
      testIgnore: [/browser\/mobile\/.*\.spec\.ts/, /browser\/design-baseline\.spec\.ts/],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-iphone',
      testMatch: /browser\/mobile\/.*\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'mobile-android',
      testMatch: /browser\/mobile\/.*\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'design-baseline',
      testMatch: /browser\/design-baseline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'performance',
      testMatch: /performance\/.*\.spec\.ts/,
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node test/fixture-storefront-api.mjs',
      url: `${fixtureApiOrigin}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        FIXTURE_API_ORIGIN: fixtureApiOrigin,
        PORT: fixtureApiPort,
        STOREFRONT_ORIGIN: storefrontOrigin,
      },
    },
    {
      // Keep the production performance gate within the memory envelope used
      // by local and constrained CI runners. The cap applies to compilation;
      // the measured standalone server starts with its normal runtime limits.
      command: usePrebuiltProductionServer
        ? 'pnpm start'
        : useProductionServer
          ? 'NODE_OPTIONS=--max-old-space-size=2048 pnpm build && pnpm start'
          : 'pnpm dev',
      url: `http://127.0.0.1:${nextServerPort}/api/health`,
      reuseExistingServer: false,
      timeout: useProductionServer ? 180_000 : 60_000,
      env: {
        PORT: nextServerPort,
        STOREFRONT_API_BASE_URL: fixtureApiOrigin,
        NEXT_PUBLIC_SITE_URL: storefrontOrigin,
        NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS: `${storefrontOrigin},${fixtureApiOrigin}`,
        NEXT_PUBLIC_RELEASE: 'browser-test',
        NEXT_PUBLIC_FACEBOOK_PIXEL_ID: '',
        NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
        NEXT_PUBLIC_TIKTOK_PIXEL_ID: '',
      },
    },
    ...(useProductionServer
      ? [
          {
            // Production disables Next's in-process compression because Nginx
            // owns that work. Keep the lab on the public port and reproduce
            // the edge boundary so slow-network budgets measure deployed bytes.
            command: 'node test/fixture-production-proxy.mjs',
            url: `${storefrontOrigin}/api/health`,
            reuseExistingServer: false,
            timeout: 30_000,
            env: { PORT: storefrontPort, UPSTREAM_PORT: nextServerPort },
          },
        ]
      : []),
  ],
});
