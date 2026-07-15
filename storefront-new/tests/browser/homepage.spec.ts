import { expect, test } from '@playwright/test';

test('renders the production homepage hierarchy with responsive banner media', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/fr');
  const banner = page.getByRole('region', { name: 'Offres du moment' });
  await expect(banner).toBeVisible();
  await expect(banner.locator('source[media="(max-width: 620px)"]').first()).toHaveAttribute('srcset', /portrait/);
  await expect(banner.locator('.home-banner-picture').first()).toHaveClass(/is-ready/);
  await expect(banner.locator('.home-banner-picture').nth(1)).toHaveClass(/is-ready/);
  const bannerTrack = banner.locator('.home-banner-track');
  const initialBannerTransform = await bannerTrack.evaluate((element) => getComputedStyle(element).transform);
  await expect.poll(() => bannerTrack.evaluate((element) => getComputedStyle(element).transform), { timeout: 7_000, intervals: [1_000] }).not.toBe(initialBannerTransform);
  await expect(page.getByRole('heading', { name: 'Top produits' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acheter par catégorie' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bien choisir pour mieux travailler' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nos marques' })).toBeVisible();
  const whiteFrames = await page.locator('.catalog-card-media, .home-category-carousel a > span, .home-editorial-media').evaluateAll((elements) => elements.every((element) => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)'));
  expect(whiteFrames).toBe(true);
  const marquee = page.locator('.home-brand-carousel > div');
  const brandGeometry = await page.locator('.home-brand-carousel').evaluate((element) => ({ viewport: element.clientWidth, track: element.firstElementChild?.scrollWidth ?? 0 }));
  expect(brandGeometry.track).toBeGreaterThan(brandGeometry.viewport * 2);
  await expect(page.locator('.home-brand-carousel a').first()).toHaveCSS('filter', 'none');
  await expect(page.locator('.home-brand-carousel a').first()).toHaveCSS('opacity', '1');
  const initialTransform = await marquee.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(1_200);
  const movingTransform = await marquee.evaluate((element) => getComputedStyle(element).transform);
  expect(movingTransform).not.toBe(initialTransform);
  await page.waitForTimeout(4_000);
  await expect.poll(() => marquee.evaluate((element) => getComputedStyle(element).transform)).not.toBe(movingTransform);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test('keeps the Arabic homepage readable and within a small-phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'أفضل المنتجات' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تسوق حسب الفئة' })).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflows).toBe(false);
});
