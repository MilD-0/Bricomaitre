import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const defaultStorageState = resolve(process.cwd(), '../../ops/runtime/admin-playwright-state.json');
const storageState = process.env.ADMIN_PLAYWRIGHT_STORAGE_STATE?.trim() || defaultStorageState;
const baselineDirectory = process.env.BRIC_UI_BASELINE_DIR?.trim();

const workspaceRoutes = [
  '/administration',
  '/administration/roles',
  '/administration/storefront',
  '/administration/history',
  '/products',
  '/archive',
  '/ai-proposals',
  '/orders',
  '/orders/ecotrack',
  '/inventory',
  '/assets',
  '/assets/featured-groups',
  '/assets/product-cards',
  '/assets/landing-pages',
  '/brands',
  '/categories',
  '/bulletin',
  '/stats',
  '/stats/time',
  '/stats/meta-ads',
  '/stats/fulfillment',
  '/stats/website',
  '/stats/search',
  '/stats/products',
  '/stats/costs',
  '/stats/ai-assistants',
  '/stats/shopping-assistant',
] as const;

const modes = [
  {
    name: 'desktop-light-en',
    locale: 'en',
    theme: 'light',
    viewport: { width: 1440, height: 900 },
    mobile: false,
  },
  {
    name: 'desktop-dark-en',
    locale: 'en',
    theme: 'dark',
    viewport: { width: 1440, height: 900 },
    mobile: false,
  },
  {
    name: 'mobile-light-en',
    locale: 'en',
    theme: 'light',
    viewport: { width: 360, height: 800 },
    mobile: true,
  },
  {
    name: 'mobile-dark-ar',
    locale: 'ar',
    theme: 'dark',
    viewport: { width: 360, height: 800 },
    mobile: true,
  },
] as const;

function screenshotName(path: string) {
  return path.replace(/^\//, '').replaceAll('/', '--') || 'home';
}

async function settleForScreenshot(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => {
        if (image.complete) return Promise.resolve();
        return new Promise<void>((done) => {
          image.addEventListener('load', () => done(), { once: true });
          image.addEventListener('error', () => done(), { once: true });
        });
      }),
    );
  });
  await page.waitForTimeout(500);
}

async function capture(page: Page, directory: string, name: string) {
  await settleForScreenshot(page);
  await page.screenshot({
    path: join(directory, `${name}.png`),
    fullPage: true,
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    style: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
}

async function openWorkspace(page: Page, locale: string, path: string) {
  const route = `/${locale}${path}`;
  await page.goto(route, { waitUntil: 'load', timeout: 120_000 });
  await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}$`));
  await expect(page.locator('[data-workspace-frame]')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('h1')).toHaveCount(1);
}

test.beforeAll(() => {
  expect(
    existsSync(storageState),
    `Missing authenticated Admin browser state at ${storageState}.`,
  ).toBe(true);
});

test('captures every authenticated workspace for a design-system baseline', async ({ browser }) => {
  test.skip(!baselineDirectory, 'Set BRIC_UI_BASELINE_DIR to opt into private UI captures.');
  test.setTimeout(20 * 60_000);

  const root = resolve(baselineDirectory!);
  await mkdir(root, { recursive: true });

  for (const mode of modes) {
    const context: BrowserContext = await browser.newContext({
      baseURL: 'http://localhost:3000',
      storageState,
      viewport: mode.viewport,
      colorScheme: mode.theme,
      reducedMotion: 'reduce',
      hasTouch: mode.mobile,
      isMobile: mode.mobile,
    });
    await context.addInitScript((theme) => window.localStorage.setItem('theme', theme), mode.theme);
    const page = await context.newPage();
    const modeDirectory = join(root, mode.name);
    await mkdir(modeDirectory, { recursive: true });

    for (const path of workspaceRoutes) {
      await openWorkspace(page, mode.locale, path);
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        mode.locale === 'ar' ? 'rtl' : 'ltr',
      );
      await expect(page.locator('html')).toHaveClass(new RegExp(mode.theme));
      await capture(page, modeDirectory, screenshotName(path));
    }

    await openWorkspace(page, mode.locale, '/products');
    if (mode.mobile) {
      await page.getByRole('button', { name: /Open sidebar|فتح الشريط الجانبي/i }).click();
      await expect(page.locator('[data-desktop-navigation-list]')).toBeVisible();
      await capture(page, modeDirectory, 'shell--navigation-open');
    }

    await context.close();
  }
});
