import { expect, test } from '@playwright/test';
import { DEFAULT_CHECKOUT_FIELDS, setCheckoutField } from '@bric/storefront-core/settings';

for (const locale of ['fr', 'ar'] as const) {
  test(`${locale} moves checkout between campaign sections and recovers changed field requirements`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 390, height: 844 });
    let fields = setCheckoutField(DEFAULT_CHECKOUT_FIELDS, 'state', 'active', false);
    fields = setCheckoutField(fields, 'email', 'active', false);
    fields = setCheckoutField(fields, 'firstName', 'required', true);
    await page.route('**/api/orders', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'checkout_fields',
          fields: ['firstName'],
          checkoutFields: fields,
        }),
      });
    });
    await page.goto(`/${locale}/landing/moved-checkout`);
    const checkout = page.locator('#landing-order');
    await expect(checkout).toHaveCount(1);
    expect(
      await checkout.evaluate((element) =>
        element.previousElementSibling?.classList.contains('landing-hero'),
      ),
    ).toBe(true);
    expect(await checkout.evaluate((element) => Boolean(element.nextElementSibling))).toBe(true);
    await checkout.locator('[name="phoneNumber1"]').fill('0550000000');
    await checkout.locator('[name="state"]').selectOption('16');
    await checkout.locator('[name="city"]').selectOption('Alger Centre');
    await checkout.locator('button[type="submit"]').click();
    const firstName = checkout.locator('[name="firstName"]');
    await expect(firstName).toHaveAttribute('aria-required', 'true');
    await expect(checkout.locator('[name="state"]')).toHaveCount(0);
    await expect(checkout.locator('[name="city"]')).toHaveCount(0);
    await expect(checkout.locator('[name="email"]')).toHaveCount(0);
    await expect(firstName).toBeFocused();
    await firstName.fill(locale === 'ar' ? 'لينا' : 'Lina');
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await checkout.screenshot({ path: testInfo.outputPath(`checkout-${locale}.png`) });
  });
}
