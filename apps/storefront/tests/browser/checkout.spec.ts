import { expect, test } from '@playwright/test';

const cart = [
  {
    productId: 12,
    token: 'desk-lamp',
    title: 'Lampe de travail',
    imageUrl: '/product-placeholder.svg',
    unitPrice: 4500,
    quantity: 2,
    availabilityStatus: 'in_stock',
  },
];

test('opens the real cart drawer to reduce an oversized basket and resumes checkout', async ({
  page,
}) => {
  const items = [12, 42, 13].map((productId) => ({
    ...cart[0],
    productId,
    token: String(productId),
    title: `Article ${productId}`,
    quantity: 20,
  }));
  await page.addInitScript(
    (value) => localStorage.setItem('bric:cart:v1', JSON.stringify(value)),
    items,
  );
  await page.route('**/api/cart/validate', (route) =>
    route.fulfill({
      json: {
        items: items.map((item) => ({
          id: item.productId,
          slug: item.token,
          title: item.title,
          price: String(item.unitPrice),
          inStock: true,
          availabilityStatus: 'in_stock',
          images: [],
        })),
      },
    }),
  );
  await page.goto('/fr/checkout');
  await expect(page.locator('.checkout-submit')).toBeDisabled();
  await page.getByRole('button', { name: 'Modifier le panier', exact: true }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  for (let index = 0; index < 10; index += 1)
    await drawer.getByRole('button', { name: /Diminuer.*Article 13/ }).click();
  await drawer.getByRole('button', { name: /Fermer/ }).click();
  await expect(page.locator('.checkout-submit')).toBeEnabled();
  await expect(
    page.getByText('Une commande peut contenir au maximum 50 articles.', { exact: false }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('bric:cart:v1')!).map(
        (item: { quantity: number }) => item.quantity,
      ),
    ),
  ).toEqual([20, 20, 10]);
});

test('ordinary confirmation retries the same request after the creation response is lost', async ({
  page,
}) => {
  let committed: { status: number; body: string } | null = null;
  const attempts: Array<{ key: string | undefined; body: string | null }> = [];
  await page.route('**/api/orders', async (route) => {
    attempts.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData(),
    });
    if (!committed) {
      const response = await route.fetch();
      committed = { status: response.status(), body: await response.text() };
      await route.abort();
    } else {
      await route.fulfill({ ...committed, contentType: 'application/json' });
    }
  });
  await page.goto('/fr/checkout?product=desk-lamp&quantity=2');
  await page.locator('[name="phoneNumber1"]').fill('0550000000');
  await page.locator('[name="state"]').selectOption('16');
  await page.locator('[name="city"]').selectOption('Alger Centre');
  await page.locator('.checkout-submit').click();
  await expect(page.locator('.checkout-recovery')).toBeVisible();
  await expect(page.locator('[name="phoneNumber1"]')).toBeDisabled();
  await page.locator('.checkout-submit').click();
  await expect(page).toHaveURL(/\/fr\/thank-you\?token=/);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
});

test('completes a cart checkout, verifies its public token, and keeps analytics free of customer data', async ({
  page,
}) => {
  const analytics: Array<Record<string, unknown>> = [];
  const browserLookups: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('/api/orders/track')) browserLookups.push(request.url());
    if (request.method() === 'POST' && request.url().endsWith('/api/analytics'))
      analytics.push(request.postDataJSON());
  });
  await page.addInitScript(
    (items) => localStorage.setItem('bric:cart:v1', JSON.stringify(items)),
    cart,
  );
  await page.goto('/fr/checkout');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Finaliser votre commande' }),
  ).toBeVisible();
  await expect(page.getByText('Commande simple et sécurisée')).toHaveCount(0);
  const submit = page.getByRole('button', { name: 'Confirmer ma commande' });
  await expect(submit).toHaveCSS('background-color', 'rgb(242, 106, 33)');
  await expect(page.getByRole('button', { name: 'Bureau de livraison' })).toBeVisible();
  await page.getByRole('textbox', { name: /Numéro de téléphone/ }).fill('0550000000');
  await page.getByRole('textbox', { name: /Prénom/ }).fill('Ada');
  await page.getByRole('textbox', { name: /Nom/ }).fill('Lovelace');
  await page.getByRole('combobox', { name: /Wilaya/ }).selectOption('16');
  await expect(page.getByRole('combobox', { name: /Wilaya/ }).locator('option')).toContainText([
    'Wilaya',
    '16. Alger',
    '31. Oran',
  ]);
  await page.getByRole('combobox', { name: /Commune/ }).selectOption('Alger Centre');
  await page.getByRole('textbox', { name: /Adresse complète/ }).fill('12 rue des Outils');
  await page.getByRole('textbox', { name: /E-mail/ }).fill('ada@example.com');
  await expect(submit.locator('svg').first()).toBeVisible();
  await submit.hover();
  await expect(submit).toHaveCSS('background-color', 'rgb(217, 86, 19)');
  await submit.click();

  await expect(page).toHaveURL(/\/fr\/thank-you\?token=fixture-public-order-token-\d+-/, {
    timeout: 20_000,
  });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Merci pour votre commande !' }),
  ).toBeVisible();
  await expect(page.locator('.thank-you-summary').getByText('Lampe de travail')).toBeVisible();
  await expect(page.locator('.thank-you-customer').getByText('0550000000')).toBeVisible();
  await expect
    .poll(() => analytics.map((event) => event.eventName))
    .toEqual(
      expect.arrayContaining([
        'begin_checkout',
        'checkout_submit_attempt',
        'order_create_success',
        'purchase',
      ]),
    );
  const beginCheckout = analytics.find((event) => event.eventName === 'begin_checkout');
  const purchase = analytics.find((event) => event.eventName === 'purchase');
  expect(beginCheckout?.metadata).toMatchObject({
    items: [{ productId: 12, productSlug: 'desk-lamp', quantity: 2, price: 4500 }],
  });
  expect(purchase?.metadata).toMatchObject({
    items: [{ productId: 12, productSlug: 'desk-lamp', quantity: 2, price: 4500 }],
  });
  const analyticsBodies = JSON.stringify(analytics);
  expect(analyticsBodies).not.toContain('0550000000');
  expect(analyticsBodies).not.toContain('ada@example.com');
  expect(analyticsBodies).not.toContain('12 rue des Outils');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bric:cart:v1'))).toBeNull();
  await page.evaluate(() => localStorage.removeItem('bric:checkout:confirmation:v1'));
  await page.reload();
  await expect(
    page.locator('.thank-you-customer').getByText('Alger', { exact: true }),
  ).toBeVisible();
  expect(browserLookups).toEqual([]);
});

test('supports the direct-product checkout in Arabic at a small-phone viewport', async ({
  page,
}) => {
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

test('persists checkout details across visits without hydration or field-layout regressions', async ({
  page,
}) => {
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    const text = message.text().toLowerCase();
    if (
      message.type() === 'error' &&
      (text.includes('hydration') ||
        text.includes('hydrated') ||
        text.includes('server rendered html'))
    ) {
      hydrationErrors.push(message.text());
    }
  });
  await page.goto('/fr/checkout?product=desk-lamp&quantity=1');

  const phone = page.getByRole('textbox', { name: /Numéro de téléphone/ });
  const wilaya = page.getByRole('combobox', { name: /Wilaya/ });
  const commune = page.getByRole('combobox', { name: /Commune/ });
  const address = page.getByRole('textbox', { name: /Adresse complète/ });
  await phone.fill('1234');
  await wilaya.selectOption('16');
  await address.fill('12 rue des Outils');
  await page.getByRole('button', { name: 'Confirmer ma commande' }).click();

  await expect(
    page.getByText('Saisissez un numéro de téléphone contenant entre 8 et 15 chiffres.'),
  ).toBeVisible();
  await expect(page.getByText('Ce champ est obligatoire.')).toBeVisible();
  const [wilayaBox, communeBox] = await Promise.all([wilaya.boundingBox(), commune.boundingBox()]);
  expect(wilayaBox?.height).toBeCloseTo(communeBox?.height ?? 0, 0);

  await phone.fill('0774246465');
  await commune.selectOption('Alger Centre');
  await page.getByRole('textbox', { name: /Nom/ }).fill('Client');
  await page.getByRole('textbox', { name: /E-mail/ }).fill('client@example.com');
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem('bric:checkout:draft:v1') ?? '{}').phoneNumber1,
      ),
    )
    .toBe('0774246465');

  await page.reload();
  await expect(phone).toHaveValue('0774246465');
  await expect(wilaya).toHaveValue('16');
  await expect(commune).toHaveValue('Alger Centre');
  await expect(address).toHaveValue('12 rue des Outils');
  await expect(page.getByRole('textbox', { name: /Nom/ })).toHaveValue('Client');
  await expect(page.getByRole('textbox', { name: /E-mail/ })).toHaveValue('client@example.com');
  expect(hydrationErrors).toEqual([]);
});
