import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import { createFixtureOrder } from '../browser/helpers/order-fixture';

type PerformanceSnapshot = {
  cls: number;
  inp: number;
  lcp: number;
};
const GOOD_LCP_MS = 2_500;
// This deterministic lab budget runs with 4x CPU throttling. The 200 ms "good"
// INP threshold is a field p75 target, not a sound pass/fail boundary for one
// virtualized CI sample.
const LAB_NAVIGATION_INP_BUDGET_MS = 300;

async function emulateWeakPhone(page: Page, context: BrowserContext) {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.addInitScript(() => {
    const state = { cls: 0, inp: 0, lcp: 0 };
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

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const interaction = entry as PerformanceEntry & {
          duration?: number;
          interactionId?: number;
        };
        if (interaction.interactionId) state.inp = Math.max(state.inp, interaction.duration ?? 0);
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
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
  // The browser suite runs against Next's development server. Warm the route
  // outside the browser so one-time compilation is not counted as user-facing
  // LCP, while the browser still performs a cold, throttled navigation.
  const warmupResponse = await page.request.get(path);
  expect(warmupResponse.ok(), `Route warm-up failed for ${path}`).toBe(true);

  const startedAt = Date.now();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await ready();
  const criticalContentMs = Date.now() - startedAt;
  await page.waitForTimeout(1_000);
  const metrics = await page.evaluate(
    () =>
      (window as Window & { __v1PerformanceGate?: PerformanceSnapshot }).__v1PerformanceGate ?? {
        cls: 0,
        inp: 0,
        lcp: 0,
      },
  );

  expect(criticalContentMs, `Critical content took ${criticalContentMs}ms`).toBeLessThan(8_000);
  expect(metrics.lcp, `LCP was ${metrics.lcp}ms`).toBeGreaterThan(0);
  expect(metrics.lcp, `LCP was ${metrics.lcp}ms`).toBeLessThanOrEqual(GOOD_LCP_MS);
  expect(metrics.cls, `CLS was ${metrics.cls}`).toBeLessThanOrEqual(0.1);
}

test('homepage meets the weak-phone content, LCP, and layout-stability budgets', async ({
  page,
  context,
}) => {
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(page, '/fr', async () => {
    await expect(page.getByRole('heading', { level: 2, name: 'Top produits' })).toBeVisible();
  });
});

test('mobile navigation stays within the weak-phone lab interaction budget', async ({
  page,
  context,
}) => {
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(page, '/fr/products', async () => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Produits pour vos travaux' }),
    ).toBeVisible();
  });
  await expect(page.locator('.navigation-categories-skeleton')).toHaveCount(0, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Ouvrir le menu' })).toBeVisible();
  await page.waitForTimeout(250);
  const inp = await page.evaluate(
    () =>
      (window as Window & { __v1PerformanceGate?: PerformanceSnapshot }).__v1PerformanceGate?.inp ??
      0,
  );

  expect(inp, `Mobile navigation INP was ${inp}ms`).toBeGreaterThan(0);
  expect(inp, `Mobile navigation INP was ${inp}ms`).toBeLessThanOrEqual(
    LAB_NAVIGATION_INP_BUDGET_MS,
  );
});

test('product detail meets the good mobile LCP threshold on a weak phone', async ({
  page,
  context,
}) => {
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(page, '/fr/products/desk-lamp', async () => {
    await expect(page.getByRole('heading', { level: 1, name: 'Lampe de travail' })).toBeVisible();
  });
});

test('landing page meets the weak-phone content, LCP, and layout-stability budgets', async ({
  page,
  context,
}) => {
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(page, '/fr/landing/lampe-atelier', async () => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Éclairez chaque chantier' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commander maintenant' })).toBeVisible();
  });
});

test('checkout meets the weak-phone content, LCP, and layout-stability budgets', async ({
  page,
  context,
}) => {
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(page, '/fr/checkout?product=desk-lamp&quantity=1', async () => {
    await expect(
      page.getByRole('heading', { level: 1, name: 'Finaliser votre commande' }),
    ).toBeVisible();
    await expect(page.getByText('Lampe de travail').first()).toBeVisible();
  });
});

test('thank-you meets the weak-phone content, LCP, and layout-stability budgets', async ({
  page,
  context,
  request,
}) => {
  const order = await createFixtureOrder(request);
  await emulateWeakPhone(page, context);
  await expectWeakPhoneBudget(
    page,
    `/fr/thank-you?token=${encodeURIComponent(order.publicToken)}`,
    async () => {
      await expect(
        page.getByRole('heading', { level: 1, name: 'Merci pour votre commande !' }),
      ).toBeVisible({ timeout: 9_000 });
      await expect(page.locator('.thank-you-summary').getByText('Lampe de travail')).toBeVisible({
        timeout: 9_000,
      });
    },
  );
});
