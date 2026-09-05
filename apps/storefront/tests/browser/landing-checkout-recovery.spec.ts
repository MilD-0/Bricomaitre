import { expect, test, type Page } from '@playwright/test';

async function fillLandingOrder(page: Page) {
  await page.locator('[name="phoneNumber1"]').fill('0550000000');
  await page.locator('[name="state"]').selectOption('16');
  await page.locator('[name="city"]').selectOption('Alger Centre');
  await page.locator('[name="homeAddress"]').fill('12 rue des Outils');
}

for (const locale of ['fr', 'ar']) {
  test(`submits the ${locale} landing order despite oversized campaign data and malformed tracking cookies`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 360, height: 740 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const query = new URLSearchParams({
      fbclid: 'x'.repeat(250),
      utm_source: 'fb',
      utm_campaign: 'حملة'.repeat(40),
      utm_content: 'عرض'.repeat(50),
      extra: 'x'.repeat(2100),
    });
    await page.goto(`/${locale}/landing/lampe-atelier?${query}`);
    await fillLandingOrder(page);
    await page.evaluate(() => {
      for (const name of ['_ga', '_fbc', '_ttp']) document.cookie = `${name}=%ZZ; Path=/`;
    });
    const submitted = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/orders') && response.request().method() === 'POST',
    );
    await page.locator('.checkout-submit').click();
    expect((await submitted).status()).toBe(201);
    await expect(page).toHaveURL(new RegExp(`/${locale}/thank-you\\?token=`));
    expect(errors).toEqual([]);
  });

  test(`shows progress and recovers from stalled cart validation on the ${locale} landing page`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/${locale}/landing/lampe-atelier`);
    await fillLandingOrder(page);
    await page.route('**/api/cart/validate', () => {});
    await page.locator('.checkout-submit').click();
    await expect(page.locator('.checkout-layout')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.checkout-submit')).toBeDisabled();
    await expect(page.locator('.checkout-spinner')).toBeVisible();
    await expect(page.locator('.checkout-submit-error')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.checkout-submit')).toBeEnabled();
    await expect(page.locator('[name="phoneNumber1"]')).toHaveValue('0550000000');
    await page.unroute('**/api/cart/validate');
    await page.locator('.checkout-submit').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/thank-you\\?token=`));
  });
}
