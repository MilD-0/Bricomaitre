import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

const defaultStorageState = resolve(process.cwd(), '../../ops/runtime/admin-playwright-state.json');
const storageState = process.env.ADMIN_PLAYWRIGHT_STORAGE_STATE?.trim() || defaultStorageState;

test.beforeAll(() => {
  expect(
    existsSync(storageState),
    `Missing authenticated Admin browser state at ${storageState}.`,
  ).toBe(true);
});

test('AI operations stats use focused pages and preserve the active range', async ({
  page,
}, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) failedRequests.push(request.url());
  });

  await page.goto('/en/stats/ai-assistants?range=30d&grain=auto');
  await expect(page.getByRole('heading', { name: 'AI operations' })).toBeVisible();
  await expect(page.getByText('Interactive requests')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Workflows' })).toBeVisible();
  await expect(page.getByText(/AI-influenced/i)).toHaveCount(0);

  const mobile = (page.viewportSize()?.width ?? 1_280) < 1_024;
  if (mobile) {
    await page.getByLabel('AI analytics range').selectOption('90d');
  } else {
    await page.getByRole('button', { name: '90 days' }).click();
  }
  await expect(page).toHaveURL(/range=90d/);
  await expect(page.getByText('Interactive requests')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'AI operations' })).toBeVisible();

  if (mobile) {
    await page.getByRole('button', { name: 'Open sidebar' }).click();
    await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeVisible();
  }
  const shoppingAssistantLink = page.getByRole('link', { name: 'Shopping assistant' });
  await expect(shoppingAssistantLink).toBeVisible();
  await Promise.all([
    page.waitForURL(/\/stats\/shopping-assistant\?range=90d/),
    shoppingAssistantLink.click(),
  ]);
  await expect(page.getByRole('heading', { name: 'Shopping assistant' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('heading', { name: 'Activity and assisted orders' })).toBeVisible();
  await expect(page.getByText('Opened')).toBeVisible();
  await expect(page.getByText(/influenced/i)).toHaveCount(0);

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);

  await page.screenshot({
    path: testInfo.outputPath(`ai-stats-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('AI stats keep prior data visible when a filtered request fails', async ({ page }) => {
  await page.goto('/en/stats/ai-assistants?range=30d&grain=auto');
  await expect(page.getByText('Interactive requests')).toBeVisible();

  let intercepted = false;
  await page.route(/\/api\/stats\/ai(?:\?|$)/, async (route) => {
    intercepted = true;
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Simulated analytics failure' }),
    });
  });
  const mobile = (page.viewportSize()?.width ?? 1_280) < 1_024;
  if (mobile) {
    await page.getByLabel('AI analytics range').selectOption('14d');
  } else {
    await page.getByRole('button', { name: '14 days' }).click();
  }

  await expect.poll(() => intercepted).toBe(true);
  await expect(page.getByText('Interactive requests')).toBeVisible();
  await expect(
    page.getByText(/Simulated analytics failure|request failed with status 500/i),
  ).toBeVisible();
});
