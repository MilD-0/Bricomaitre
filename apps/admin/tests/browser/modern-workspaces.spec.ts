import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const modernRoutes = [
  '/en/administration',
  '/en/administration/roles',
  '/en/administration/storefront',
  '/en/administration/history',
  '/en/products',
  '/en/archive',
  '/en/ai-proposals',
  '/en/orders',
  '/en/orders/ecotrack',
  '/en/inventory',
  '/en/assets',
  '/en/assets/featured-groups',
  '/en/assets/product-cards',
  '/en/assets/landing-pages',
  '/en/brands',
  '/en/categories',
  '/en/bulletin',
  '/en/stats',
  '/en/stats/time',
  '/en/stats/meta-ads',
  '/en/stats/fulfillment',
  '/en/stats/website',
  '/en/stats/search',
  '/en/stats/products',
  '/en/stats/costs',
  '/en/stats/ai-assistants',
  '/en/stats/shopping-assistant',
] as const;

const accessibilityRoutes = [
  '/en/administration',
  '/en/products',
  '/en/ai-proposals',
  '/en/orders',
  '/en/orders/ecotrack',
  '/en/inventory',
  '/en/assets/landing-pages',
  '/en/brands',
  '/en/bulletin',
  '/en/stats',
  '/en/stats/shopping-assistant',
] as const;

const screenshotRoutes = new Set([
  '/en/products',
  '/en/orders',
  '/en/stats',
  '/en/stats/shopping-assistant',
]);

async function openModernWorkspace(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'load', timeout: 120_000 });
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
  await expect(page.locator('[data-workspace-frame]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('[data-workspace-header]')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
}

test.beforeEach(async ({ context, isMobile, page }) => {
  await context.addCookies([
    {
      name: 'bric-admin-legacy-ui',
      value: '0',
      url: 'http://localhost:3000',
      sameSite: 'Lax',
    },
  ]);
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
});

test('keeps every modern workspace structurally clean and within the viewport', async ({
  page,
}, testInfo) => {
  test.setTimeout(6 * 60_000);

  for (const path of modernRoutes) {
    const browserErrors: string[] = [];
    const failedResponses: string[] = [];
    const onConsole = (message: { type(): string; text(): string }) => {
      if (message.type() === 'error') browserErrors.push(message.text());
    };
    const onPageError = (error: Error) => browserErrors.push(error.message);
    const onResponse = (response: { status(): number; url(): string }) => {
      if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);

    await test.step(path, async () => {
      await openModernWorkspace(page, path);
      await page.waitForTimeout(350);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflowed by ${overflow}px`).toBeLessThanOrEqual(1);
      expect(browserErrors, `${path} emitted browser errors`).toEqual([]);
      expect(failedResponses, `${path} returned failed responses`).toEqual([]);
      if (screenshotRoutes.has(path)) {
        await testInfo.attach(`${testInfo.project.name}-${path.slice(4).replaceAll('/', '-')}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
    });

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }
});

test('keeps representative modern workspaces at WCAG A and AA', async ({ page }) => {
  test.setTimeout(4 * 60_000);

  for (const path of accessibilityRoutes) {
    await test.step(path, async () => {
      await openModernWorkspace(page, path);
      await page.waitForTimeout(350);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          help: violation.help,
          targets: violation.nodes.map((node) => node.target),
        })),
        `${path} has accessibility violations`,
      ).toEqual([]);
    });
  }
});

test('keeps default Stats routes canonical without hydration navigation', async ({ page }) => {
  for (const path of ['/en/stats', '/en/stats/ai-assistants', '/en/stats/shopping-assistant']) {
    await page.goto(path, { waitUntil: 'load' });
    await expect(page.locator('[data-workspace-frame]')).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(`http://localhost:3000${path}`);
  }
});
