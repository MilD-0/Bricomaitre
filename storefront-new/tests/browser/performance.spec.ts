import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { createFixtureOrder } from './helpers/order-fixture';

type PerformanceSnapshot = {
  cls: number;
  lcp: number;
};

async function emulateWeakPhone(page: Page, context: BrowserContext) {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => {
    const state = { cls: 0, lcp: 0 };
    Object.defineProperty(window, '__v1PerformanceGate', { value: state, configurable: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
        if (!shift.hadRecentInput) state.cls += shift.value ?? 0;
      }
    }).observe({ type: 'layout-shift', buffered: true });

    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      state.lcp = entries.at(-1)?.startTime ?? state.lcp;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });

  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: 'cellular4g',
  });
}

async function expectWeakPhoneBudget(page: Page, path: string, ready: () => Promise<void>) {
  const startedAt = Date.now();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await ready();
  const criticalContentMs = Date.now() - startedAt;
  await page.waitForTimeout(1_000);
  const metrics = await page.evaluate(() => (
    (window as Window & { __v1PerformanceGate?: PerformanceSnapshot }).__v1PerformanceGate
      ?? { cls: 0, lcp: 0 }
  ));

  expect(criticalContentMs, `Critical content took ${criticalContentMs}ms`).toBeLessThan(8_000);
  expect(metrics.lcp, `LCP was ${metrics.lcp}ms`).toBeGreaterThan(0);
  expect(metrics.lcp, `LCP was ${metrics.lcp}ms`).toBeLessThan(8_000);
  expect(metrics.cls, `CLS was ${metrics.cls}`).toBeLessThanOrEqual(0.1);
}

test('homepage meets the weak-phone content, LCP, and layout-stability budgets', async ({ page, context }) => {
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(page, '/fr', async () => {
    await expect(page.getByRole('heading', { level: 2, name: 'Top produits' })).toBeVisible();
  });
});

test('landing page meets the weak-phone content, LCP, and layout-stability budgets', async ({ page, context }) => {
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(page, '/fr/landing/lampe-atelier', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Éclairez chaque chantier' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commander maintenant' })).toBeVisible();
  });
});

test('checkout meets the weak-phone content, LCP, and layout-stability budgets', async ({ page, context }) => {
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(page, '/fr/checkout?product=desk-lamp&quantity=1', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Finaliser votre commande' })).toBeVisible();
    await expect(page.getByText('Lampe de travail').first()).toBeVisible();
  });
});

test('thank-you meets the weak-phone content, LCP, and layout-stability budgets', async ({ page, context, request }) => {
  const order = await createFixtureOrder(request);
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(
    page,
    `/fr/thank-you?token=${encodeURIComponent(order.publicToken)}`,
    async () => {
      await expect(page.getByRole('heading', { level: 1, name: 'Merci pour votre commande !' })).toBeVisible({ timeout: 9_000 });
      await expect(page.locator('.thank-you-summary').getByText('Lampe de travail')).toBeVisible({ timeout: 9_000 });
    },
  );
});
