import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3003',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /mobile\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-iphone',
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'mobile-android',
      testMatch: /mobile\/.*\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
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
      command: 'pnpm dev',
      url: 'http://127.0.0.1:3003/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        STOREFRONT_API_BASE_URL: 'http://127.0.0.1:4311',
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3003',
        NEXT_PUBLIC_STOREFRONT_IMAGE_ORIGINS: 'http://127.0.0.1:3003',
        NEXT_PUBLIC_RELEASE: 'browser-test',
        NEXT_PUBLIC_FACEBOOK_PIXEL_ID: '',
        NEXT_PUBLIC_GA_MEASUREMENT_ID: '',
        NEXT_PUBLIC_TIKTOK_PIXEL_ID: '',
      },
    },
  ],
});
