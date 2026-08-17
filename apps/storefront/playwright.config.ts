import { defineConfig, devices } from '@playwright/test';

const useProductionServer = process.env.BRIC_PLAYWRIGHT_SERVER === 'production';

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
    baseURL: 'http://127.0.0.1:3003',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /browser\/.*\.spec\.ts/,
      testIgnore: /browser\/mobile\/.*\.spec\.ts/,
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
      name: 'performance',
      testMatch: /performance\/.*\.spec\.ts/,
      retries: 0,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node test/fixture-storefront-api.mjs',
      url: 'http://127.0.0.1:4311/api/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: useProductionServer ? 'pnpm build && pnpm start' : 'pnpm dev',
      url: 'http://127.0.0.1:3003/api/health',
      reuseExistingServer: false,
      timeout: useProductionServer ? 180_000 : 60_000,
      env: {
        STOREFRONT_API_BASE_URL: 'http://127.0.0.1:4311',
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3003',
        NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS: 'http://127.0.0.1:3003,http://127.0.0.1:4311',
        NEXT_PUBLIC_RELEASE: 'browser-test',
        NEXT_PUBLIC_FACEBOOK_PIXEL_ID: '',
        NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
        NEXT_PUBLIC_TIKTOK_PIXEL_ID: '',
      },
    },
  ],
});
