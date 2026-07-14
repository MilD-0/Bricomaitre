import { expect, test } from '@playwright/test';

const cart = [{
  productId: 12, token: 'desk-lamp', title: 'Lampe de travail', imageUrl: '/product-placeholder.svg',
  unitPrice: 4500, quantity: 2, availabilityStatus: 'in_stock',
}];

test('completes a cart checkout, verifies its public token, and keeps analytics free of customer data', async ({ page }) => {
  const analytics: Array<Record<string, unknown>> = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/analytics')) analytics.push(request.postDataJSON());
  });
  await page.addInitScript((items) => localStorage.setItem('bric:cart:v1', JSON.stringify(items)), cart);
  await page.goto('/fr/checkout');

  await expect(page.getByRole('heading', { level: 1, name: 'Finaliser votre commande' })).toBeVisible();
  await page.getByRole('textbox', { name: /Numéro de téléphone/ }).fill('0550000000');
  await page.getByRole('textbox', { name: /Prénom/ }).fill('Ada');
  await page.getByRole('textbox', { name: /Nom/ }).fill('Lovelace');
  await page.getByRole('combobox', { name: /Wilaya/ }).selectOption('16');
  await page.getByRole('combobox', { name: /Commune/ }).selectOption('Alger Centre');
  await page.getByRole('textbox', { name: /Adresse complète/ }).fill('12 rue des Outils');
  await page.getByRole('textbox', { name: /E-mail/ }).fill('ada@example.com');
  await page.getByRole('button', { name: 'Confirmer ma commande' }).click();

  await expect(page).toHaveURL(/\/fr\/thank-you\?orderId=100&token=fixture-public-order-token-100-/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1, name: 'Merci pour votre commande !' })).toBeVisible();
  await expect(page.locator('.thank-you-summary').getByText('Lampe de travail')).toBeVisible();
  await expect(page.locator('.thank-you-customer').getByText('0550000000')).toBeVisible();
  await expect.poll(() => analytics.map((event) => event.eventName)).toEqual(expect.arrayContaining([
    'begin_checkout', 'checkout_submit_attempt', 'order_create_success', 'purchase',
  ]));
  const analyticsBodies = JSON.stringify(analytics);
  expect(analyticsBodies).not.toContain('0550000000');
  expect(analyticsBodies).not.toContain('ada@example.com');
  expect(analyticsBodies).not.toContain('12 rue des Outils');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bric:cart:v1'))).toBeNull();
});

test('supports the direct-product checkout in Arabic at a small-phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/ar/checkout?product=desk-lamp&quantity=2');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'إتمام الطلب' })).toBeVisible();
  await expect(page.getByText('مصباح العمل')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /رقم الهاتف/ })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /الولاية/ })).toBeVisible();
  await expect(page.locator('[name="phoneNumber2"]')).toHaveCount(0);
  await expect(page.locator('.checkout-layout')).toHaveCSS('grid-template-columns', /.+/);
});
