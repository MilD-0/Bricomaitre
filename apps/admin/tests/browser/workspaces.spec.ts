import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const workspaceRoutes = [
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

const accessibilityRoutes = new Set<string>([
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
]);

const screenshotRoutes = new Set([
  '/en/products',
  '/en/orders',
  '/en/stats',
  '/en/stats/shopping-assistant',
]);

async function openWorkspace(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'load', timeout: 120_000 });
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}$`));
  await expect(page.locator('[data-workspace-frame]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('[data-workspace-header]')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
}

test.beforeEach(async ({ isMobile, page }) => {
  if (isMobile) await page.setViewportSize({ width: 360, height: 800 });
});

for (const locale of ['fr', 'ar']) {
  test(`recovers from an unknown ${locale} page through the authorized home route`, async ({
    page,
  }, testInfo) => {
    for (const path of ['missing-audit-page', 'assets/landing-pages/not-an-id']) {
      await page.goto(`/${locale}/${path}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        locale === 'fr'
          ? "Cette page d'administration n'existe pas"
          : 'هذه الصفحة الإدارية غير موجودة',
      );
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: testInfo.outputPath(
          `not-found-${locale}-${path.includes('/') ? 'entity' : 'route'}.png`,
        ),
      });
      await page.locator(`a[href="/${locale}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/administration$`));
      await expect(page.locator('[data-workspace-frame]')).toBeVisible();
    }
  });
}

test.describe('workspace checks', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const path of workspaceRoutes) {
    test(`${path} stays within the viewport and meets its accessibility checks`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      const browserErrors: string[] = [];
      const failedResponses: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });
      page.on('pageerror', (error) => browserErrors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400)
          failedResponses.push(`${response.status()} ${response.url()}`);
      });

      await openWorkspace(page, path);
      await page.waitForTimeout(350);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflowed by ${overflow}px`).toBeLessThanOrEqual(1);
      if (accessibilityRoutes.has(path)) {
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
      }
      if (screenshotRoutes.has(path)) {
        await testInfo.attach(`${testInfo.project.name}-${path.slice(4).replaceAll('/', '-')}`, {
          body: await page.screenshot(),
          contentType: 'image/png',
        });
      }
      expect(browserErrors, `${path} emitted browser errors`).toEqual([]);
      expect(failedResponses, `${path} returned failed responses`).toEqual([]);
    });
  }
});

test('keeps default Stats routes canonical without hydration navigation', async ({
  baseURL,
  page,
}) => {
  expect(baseURL).toBeTruthy();
  for (const path of ['/en/stats', '/en/stats/ai-assistants', '/en/stats/shopping-assistant']) {
    await page.goto(path, { waitUntil: 'load' });
    await expect(page.locator('[data-workspace-frame]')).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(`${baseURL}${path}`);
  }
});
