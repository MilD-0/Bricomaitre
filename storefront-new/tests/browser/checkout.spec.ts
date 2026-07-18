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
  await expect(page.getByText('Commande simple et sécurisée')).toHaveCount(0);
  const submit = page.getByRole('button', { name: 'Confirmer ma commande' });
  await expect(submit).toHaveCSS('background-color', 'rgb(242, 106, 33)');
  await expect(page.getByRole('button', { name: 'Bureau de livraison' })).toBeVisible();
  await page.getByRole('textbox', { name: /Numéro de téléphone/ }).fill('0550000000');
  await page.getByRole('textbox', { name: /Prénom/ }).fill('Ada');
  await page.getByRole('textbox', { name: /Nom/ }).fill('Lovelace');
  await page.getByRole('combobox', { name: /Wilaya/ }).selectOption('16');
  await expect(page.getByRole('combobox', { name: /Wilaya/ }).locator('option')).toContainText(['Wilaya', '16. Alger', '31. Oran']);
  await page.getByRole('combobox', { name: /Commune/ }).selectOption('Alger Centre');
  await page.getByRole('textbox', { name: /Adresse complète/ }).fill('12 rue des Outils');
  await page.getByRole('textbox', { name: /E-mail/ }).fill('ada@example.com');
  await expect(submit.locator('svg').first()).toBeVisible();
  await submit.hover();
  await expect(submit).toHaveCSS('background-color', 'rgb(217, 86, 19)');
  await submit.click();

  await expect(page).toHaveURL(/\/fr\/thank-you\?orderId=\d+&token=fixture-public-order-token-\d+-/, { timeout: 20_000 });
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
  await expect(page.getByRole('button', { name: 'مكتب التوصيل' })).toBeVisible();
  await expect(page.locator('[name="phoneNumber2"]')).toHaveCount(0);
  await expect(page.locator('.checkout-layout')).toHaveCSS('grid-template-columns', /.+/);
});

test('persists checkout details across visits without hydration or field-layout regressions', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    const text = message.text().toLowerCase();
    if (message.type() === 'error' && (text.includes('hydration') || text.includes('hydrated') || text.includes('server rendered html'))) {
      hydrationErrors.push(message.text());
    }
  });
  await page.goto('/fr/checkout?product=desk-lamp&quantity=1');

  const phone = page.getByRole('textbox', { name: /Numéro de téléphone/ });
  const wilaya = page.getByRole('combobox', { name: /Wilaya/ });
  const commune = page.getByRole('combobox', { name: /Commune/ });
  const address = page.getByRole('textbox', { name: /Adresse complète/ });
  await phone.fill('1234567890');
  await wilaya.selectOption('16');
  await address.fill('12 rue des Outils');
  await page.getByRole('button', { name: 'Confirmer ma commande' }).click();

  await expect(page.getByText('Saisissez un numéro de téléphone algérien valide à 10 chiffres.')).toBeVisible();
  await expect(page.getByText('Ce champ est obligatoire.')).toBeVisible();
  const [wilayaBox, communeBox] = await Promise.all([wilaya.boundingBox(), commune.boundingBox()]);
  expect(wilayaBox?.height).toBeCloseTo(communeBox?.height ?? 0, 0);

  await phone.fill('0774246465');
  await commune.selectOption('Alger Centre');
  await page.getByRole('textbox', { name: /Nom/ }).fill('Client');
  await page.getByRole('textbox', { name: /E-mail/ }).fill('client@example.com');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('bric:checkout:draft:v1') ?? '{}').phoneNumber1)).toBe('0774246465');

  await page.reload();
  await expect(phone).toHaveValue('0774246465');
  await expect(wilaya).toHaveValue('16');
  await expect(commune).toHaveValue('Alger Centre');
  await expect(address).toHaveValue('12 rue des Outils');
  await expect(page.getByRole('textbox', { name: /Nom/ })).toHaveValue('Client');
  await expect(page.getByRole('textbox', { name: /E-mail/ })).toHaveValue('client@example.com');
  expect(hydrationErrors).toEqual([]);
});
