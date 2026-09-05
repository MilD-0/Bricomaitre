import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const defaultStorageState = resolve(process.cwd(), '../../ops/runtime/admin-playwright-state.json');
const storageState = process.env.ADMIN_PLAYWRIGHT_STORAGE_STATE?.trim() || defaultStorageState;

function readLoopbackOrigin(name: string, fallback: string) {
  const origin = new URL(process.env[name] ?? fallback);
  if (
    origin.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(origin.hostname) ||
    !origin.port
  ) {
    throw new Error(`${name} must be an HTTP localhost or 127.0.0.1 origin with an explicit port.`);
  }
  return origin.origin;
}

const adminOrigin = readLoopbackOrigin('BRIC_PLAYWRIGHT_ADMIN_ORIGIN', 'http://localhost:3000');
const adminUrl = new URL(adminOrigin);
const adminPort = adminUrl.port;
const adminReadinessOrigin = `http://127.0.0.1:${adminPort}`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  failOnFlakyTests: Boolean(process.env.CI),
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['line'],
        ['junit', { outputFile: 'test-results/playwright-junit.xml' }],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
      ]
    : 'list',
  use: {
    baseURL: adminOrigin,
    storageState: existsSync(storageState) ? storageState : undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /design-baseline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      testIgnore: /design-baseline\.spec\.ts/,
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
    {
      name: 'design-baseline',
      testMatch: /design-baseline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev --hostname 127.0.0.1',
    url: `${adminReadinessOrigin}/android-chrome-192x192.png`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      BETTER_AUTH_URL: adminOrigin,
      BRIC_PLAYWRIGHT_DISABLE_DEV_INDICATORS: '1',
      PORT: adminPort,
    },
  },
});
