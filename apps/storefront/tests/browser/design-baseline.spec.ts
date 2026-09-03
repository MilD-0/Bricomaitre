import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const baselineDirectory = process.env.BRIC_UI_BASELINE_DIR?.trim();
if (!baselineDirectory) {
  throw new Error('Set BRIC_UI_BASELINE_DIR to a writable output directory.');
}
const storefrontOrigin = process.env.BRIC_PLAYWRIGHT_STOREFRONT_ORIGIN ?? 'http://127.0.0.1:3003';

const modes = [
  {
    name: 'desktop-fr',
    locale: 'fr',
    viewport: { width: 1440, height: 900 },
    mobile: false,
  },
  {
    name: 'desktop-ar',
    locale: 'ar',
    viewport: { width: 1440, height: 900 },
    mobile: false,
  },
  {
    name: 'mobile-fr',
    locale: 'fr',
    viewport: { width: 360, height: 740 },
    mobile: true,
  },
  {
    name: 'mobile-ar',
    locale: 'ar',
    viewport: { width: 360, height: 740 },
    mobile: true,
  },
] as const;

const pageScenarios = [
  { name: 'homepage', path: '' },
  { name: 'catalog', path: '/products' },
  { name: 'category', path: '/categories/lighting' },
  { name: 'brand', path: '/brands/bric-pro' },
  { name: 'product', path: '/products/desk-lamp' },
  { name: 'checkout', path: '/checkout?product=desk-lamp&quantity=2' },
  { name: 'landing', path: '/landing/lampe-atelier' },
  { name: 'product-not-found', path: '/products/missing-product' },
  { name: 'route-not-found', path: '/missing-page', rootErrorDocument: true },
] as const;

async function settleForScreenshot(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const visibleImages = Array.from(document.images).filter((image) => {
      const bounds = image.getBoundingClientRect();
      return image.loading !== 'lazy' || bounds.top < window.innerHeight * 1.5;
    });
    await Promise.race([
      Promise.all(
        visibleImages.map((image) => {
          if (image.complete) return Promise.resolve();
          return new Promise<void>((done) => {
            image.addEventListener('load', () => done(), { once: true });
            image.addEventListener('error', () => done(), { once: true });
          });
        }),
      ),
      new Promise<void>((done) => window.setTimeout(done, 3_000)),
    ]);
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

async function createFixtureOrder(context: BrowserContext) {
  const response = await context.request.post('/api/orders', {
    headers: { 'idempotency-key': `design-baseline-${crypto.randomUUID()}` },
    data: {
      firstName: 'Client',
      lastName: 'Baseline',
      email: null,
      phoneNumber1: '0550000000',
      phoneNumber2: null,
      cartProducts: ['desk-lamp'],
      delivery: 0,
      state: 16,
      city: 'Alger Centre',
      homeAddress: '12 rue des Outils',
      note: null,
      promoCode: null,
      visitId: null,
      journeyId: null,
      sessionId: null,
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { item: { publicToken: string } };
  return body.item.publicToken;
}

async function openSurface(page: Page, locale: string, path: string, rootErrorDocument = false) {
  await page.goto(`/${locale}${path}`, { waitUntil: 'load', timeout: 120_000 });
  if (!rootErrorDocument) {
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  }
  await expect(page.locator('body')).toBeVisible();
}

test('captures every storefront surface for a design-system baseline', async ({ browser }) => {
  test.setTimeout(20 * 60_000);

  const root = resolve(baselineDirectory);
  await mkdir(root, { recursive: true });

  for (const mode of modes) {
    const context = await browser.newContext({
      baseURL: storefrontOrigin,
      viewport: mode.viewport,
      reducedMotion: 'reduce',
      hasTouch: mode.mobile,
      isMobile: mode.mobile,
    });
    const page = await context.newPage();
    const modeDirectory = join(root, mode.name);
    await mkdir(modeDirectory, { recursive: true });

    for (const scenario of pageScenarios) {
      await openSurface(page, mode.locale, scenario.path, 'rootErrorDocument' in scenario);
      await capture(page, modeDirectory, scenario.name);
    }

    const publicToken = await createFixtureOrder(context);
    await openSurface(page, mode.locale, `/thank-you?token=${encodeURIComponent(publicToken)}`);
    await capture(page, modeDirectory, 'thank-you');

    await openSurface(page, mode.locale, '/products');
    const cartButton = page.locator('.navigation-cart');
    await cartButton.click();
    await expect(page.locator('.cart-drawer')).toBeVisible();
    await capture(page, modeDirectory, 'overlay--cart');
    await page.keyboard.press('Escape');

    await openSurface(page, mode.locale, '/products');
    const search = page.locator('.global-search input');
    await search.fill(mode.locale === 'ar' ? 'مصباح' : 'lampe');
    await expect(page.locator('.global-search-panel')).toBeVisible();
    await capture(page, modeDirectory, 'overlay--search');

    await openSurface(page, mode.locale, '/products/desk-lamp');
    const assistant = page.locator('.shopping-assistant-launcher');
    if (await assistant.isVisible().catch(() => false)) {
      await assistant.click();
      await expect(page.locator('.shopping-assistant-sheet')).toBeVisible();
      await capture(page, modeDirectory, 'overlay--shopping-assistant');
      await page.keyboard.press('Escape');
    }

    await openSurface(page, mode.locale, '/products/desk-lamp');
    await page.locator('.product-media-zoom-trigger').first().click();
    await expect(page.locator('.pswp')).toBeVisible();
    await capture(page, modeDirectory, 'overlay--product-lightbox');
    await page.keyboard.press('Escape');

    if (mode.mobile) {
      await openSurface(page, mode.locale, '/products');
      await page.locator('.navigation-menu-button').click();
      await expect(page.locator('.navigation-drawer')).toBeVisible();
      await capture(page, modeDirectory, 'overlay--mobile-navigation');
      await page.keyboard.press('Escape');
      await expect(page.locator('.navigation-drawer')).toHaveCount(0);

      await page.locator('.catalog-mobile-filter-button').click();
      await expect(page.locator('.catalog-filter-sheet')).toBeVisible();
      await capture(page, modeDirectory, 'overlay--catalog-filters');
      await page.keyboard.press('Escape');
    } else {
      await openSurface(page, mode.locale, '/products');
      await page.locator('.site-navigation-menu-trigger').first().click();
      await expect(page.locator('.site-navigation-menu-panel').first()).toBeVisible();
      await capture(page, modeDirectory, 'overlay--desktop-navigation');
    }

    await context.close();
  }
});
