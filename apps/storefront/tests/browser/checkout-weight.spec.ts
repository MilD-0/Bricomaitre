import { expect, test } from '@playwright/test';

for (const locale of ['fr', 'ar'] as const) {
  for (const width of [390, 1280]) {
    test(`${locale} at ${width}px reviews changed product weight before submitting the delivery surcharge`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      let weightKg = '2.500';
      const cart = [
        {
          productId: 12,
          token: 'desk-lamp',
          title: 'Lampe de travail',
          imageUrl: '/product-placeholder.svg',
          unitPrice: 4500,
          weightKg: 2.5,
          quantity: 2,
          availabilityStatus: 'in_stock',
        },
      ];
      await page.addInitScript(
        (items) => localStorage.setItem('bric:cart:v1', JSON.stringify(items)),
        cart,
      );
      await page.route('**/api/cart/validate', (route) =>
        route.fulfill({
          json: {
            items: [
              {
                id: 12,
                slug: 'desk-lamp',
                title: 'Lampe de travail',
                titleAr: 'مصباح عمل',
                price: '4500',
                weightKg,
                inStock: true,
                availabilityStatus: 'in_stock',
                images: ['/product-placeholder.svg'],
              },
            ],
          },
        }),
      );
      const requests: Array<{ expectedWeightKg: number }> = [];
      await page.route('**/api/orders', async (route) => {
        requests.push(route.request().postDataJSON());
        await route.abort();
      });
      await page.goto(`/${locale}/checkout`);
      await page.locator('[name="phoneNumber1"]').fill('0550000000');
      await page.locator('[name="state"]').selectOption('16');
      await page.locator('[name="city"]').selectOption('Alger Centre');
      const total = page.locator('.checkout-total dd');
      await expect(total).toContainText(/9[\s.]500/);
      weightKg = '3.100';
      await page.locator('.checkout-submit').click();
      await expect(total).toContainText(/9[\s.]600/);
      expect(requests).toHaveLength(0);
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
      await total.scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${locale}-weight-review.png`) });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.locator('.checkout-submit').click();
      await expect.poll(() => requests.length).toBe(1);
      expect(requests[0]?.expectedWeightKg).toBe(6.2);
      await expect(page.locator('.checkout-recovery')).toBeVisible();
      await expect(total).toContainText(/9[\s.]600/);
    });
  }
}
