export async function runStorefrontCheckout({
  ctx,
  origin,
  cart,
  fillCheckout,
  email,
  submit,
  PHONE,
  noOverflow,
}) {
  await ctx.test(
    'storefront-stale-cart',
    'Checkout replaces stale cart prices with canonical prices before purchase',
    async ({ page, expect, save }) => {
      await page.goto(`${origin()}/fr/products/qa-drill`);
      await page.getByRole('button', { name: 'Ajouter au panier', exact: true }).click();
      await expect.poll(async () => (await cart(page)).length).toBe(1);
      await page.evaluate(() => {
        const items = JSON.parse(localStorage.getItem('bric:cart:v1'));
        items[0].unitPrice = 1;
        localStorage.setItem('bric:cart:v1', JSON.stringify(items));
      });
      await page.goto(`${origin()}/fr/checkout`);
      await expect.poll(async () => (await cart(page))[0]?.unitPrice).toBe(4500);
      await fillCheckout(page, email('stale'));
      const order = await submit(page, expect);
      await save('order.json', order);
      expect(Number(order.productSubtotal)).toBe(4500);
      expect(Number(order.totalAmount)).toBe(5100);
    },
  );
  await ctx.test(
    'storefront-validation-outage',
    'Cart validation failure retains checkout details and permits recovery',
    async ({ page, expect }) => {
      await page.goto(`${origin()}/fr/checkout?product=qa-drill&quantity=1`);
      await fillCheckout(page, email('validate-outage'));
      await page.route('**/api/cart/validate', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Injected gauntlet outage' }),
        }),
      );
      await page.locator('.checkout-submit').click();
      await expect(page.locator('.checkout-submit-error')).toBeVisible();
      await expect(page.locator('.checkout-submit')).toBeEnabled();
      await expect(page.locator('[name="phoneNumber1"]')).toHaveValue(PHONE);
      await expect(page.locator('[name="city"]')).toHaveValue('Alger Centre');
      await page.unroute('**/api/cart/validate');
      await submit(page, expect);
    },
  );
  await ctx.test(
    'storefront-lost-response',
    'A committed checkout with a lost response recovers after reload without duplicating the order',
    async ({ page, expect, save }) => {
      await page.goto(`${origin()}/fr/checkout?product=qa-drill&quantity=1`);
      await fillCheckout(page, email('lost'));
      let committed;
      let intercepted = false;
      await page.route('**/api/orders', async (route) => {
        if (route.request().method() !== 'POST' || intercepted) return route.continue();
        intercepted = true;
        const response = await route.fetch({ timeout: 60000 });
        committed = {
          status: response.status(),
          body: await response.json(),
          key: route.request().headers()['idempotency-key'],
        };
        await route.abort('connectionfailed');
      });
      await page.locator('.checkout-submit').click();
      await expect(page.locator('.checkout-recovery')).toBeVisible({ timeout: 70000 });
      expect(committed.status).toBe(201);
      expect(committed.key).toBeTruthy();
      await page.reload();
      await expect(page.locator('[name="phoneNumber1"]')).toHaveValue(PHONE);
      await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
      await expect(page).toHaveURL(/\/fr\/thank-you\?token=/, { timeout: 60000 });
      expect(new URL(page.url()).searchParams.get('token')).toBe(committed.body.item.publicToken);
      const rows = await ctx.query(`SELECT count(*) FROM orders WHERE email='${email('lost')}'`);
      expect(String(rows).trim().split('\n')).toContain('1');
      await save('recovered-order.json', committed);
    },
  );
  await ctx.test(
    'storefront-analytics-outage',
    'Broken analytics and malformed tracking cookies cannot block a revenue journey',
    async ({ page, expect, save }) => {
      await page.route('**/api/analytics', (route) => route.abort('connectionfailed'));
      await page.goto(
        `${origin()}/fr/checkout?product=qa-drill&quantity=1&fbclid=${'x'.repeat(250)}&utm_campaign=${encodeURIComponent('حملة'.repeat(40))}`,
      );
      await page.evaluate(() => {
        for (const name of ['_ga', '_fbc', '_ttp']) document.cookie = `${name}=%ZZ; Path=/`;
      });
      await fillCheckout(page, email('analytics'));
      const order = await submit(page, expect);
      await save('order.json', order);
      await expect(page.locator('.thank-you-summary')).toBeVisible();
    },
  );
  await ctx.test(
    'storefront-arabic-mobile',
    'Arabic checkout completes at a narrow viewport with matching quantity and totals',
    async ({ page, expect, save }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(`${origin()}/ar/products/qa-drill`);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('مثقاب للتحقق');
      await noOverflow(page, expect);
      await page.getByRole('button', { name: 'اطلب الآن', exact: true }).click();
      await expect(page).toHaveURL(/\/ar\/checkout\?product=qa-drill&quantity=1$/);
      await fillCheckout(page, email('arabic'), 'ar');
      await noOverflow(page, expect);
      const order = await submit(page, expect, 'ar');
      await save('order.json', order);
      expect(Number(order.totalAmount)).toBe(5100);
      await expect(page.locator('.thank-you-summary')).toContainText('مثقاب للتحقق');
      await noOverflow(page, expect);
    },
  );
  await ctx.test(
    'storefront-confirmation-privacy',
    'Confirmation is recoverable by token and never exposes another order through its numeric ID',
    async ({ page, context, expect, save }) => {
      await page.goto(`${origin()}/fr/checkout?product=qa-drill&quantity=1`);
      await fillCheckout(page, email('privacy'));
      const order = await submit(page, expect);
      await page.reload();
      await expect(page.locator('.thank-you-customer')).toContainText(PHONE);
      await expect(page.locator('.order-tracking li[aria-current="step"]')).toHaveCount(1);
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
        'content',
        /noindex/,
      );
      const html = await context.request.get(`${origin()}/fr/thank-you?orderId=${order.id}`);
      expect(await html.text()).not.toContain(email('privacy'));
      const stranger = await context.browser().newContext();
      try {
        const otherPage = await stranger.newPage();
        await otherPage.goto(`${origin()}/fr/thank-you?orderId=${order.id}`);
        await expect(otherPage.locator('.thank-you-customer')).toHaveCount(0);
        await otherPage.goto(`${origin()}/fr/thank-you?token=invalid-gauntlet-${ctx.runId}`);
        await expect(otherPage.locator('.thank-you-customer')).toHaveCount(0);
        await save(
          'support-links.json',
          await page
            .locator('.thank-you-page a[href^="tel:"]')
            .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
        );
      } finally {
        await stranger.close();
      }
    },
  );
  await ctx.test(
    'storefront-mixed-cart',
    'A multi-product cart preserves line quantities and exact totals through checkout',
    async ({ page, expect, save }) => {
      for (const slug of ['qa-drill', 'qa-hammer']) {
        await page.goto(`${origin()}/fr/products/${slug}`);
        if (slug === 'qa-hammer')
          await page.getByRole('button', { name: 'Augmenter la quantité', exact: true }).click();
        await page.getByRole('button', { name: 'Ajouter au panier', exact: true }).click();
      }
      await expect.poll(async () => (await cart(page)).length).toBe(2);
      await page.getByRole('button', { name: 'Panier: 3', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Votre panier' })
        .getByRole('link', { name: 'Passer la commande', exact: true })
        .click();
      await fillCheckout(page, email('mixed'));
      const order = await submit(page, expect);
      await save('order.json', order);
      expect(Number(order.productSubtotal)).toBe(6900);
      expect(Number(order.totalAmount)).toBe(7500);
      expect(order.orderProducts).toHaveLength(2);
      expect(await cart(page)).toHaveLength(0);
    },
  );
  await ctx.test(
    'storefront-cart-unavailable',
    'A saved cart cannot resurrect a product that is unavailable',
    async ({ page, context, expect }) => {
      const response = await context.request.get(`${origin()}/api/catalog?q=épuisée`);
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      const product = body.items.find((item) => item.slug === 'qa-unavailable');
      expect(
        product,
        'Unavailable fixture must be discoverable in the public catalog',
      ).toBeTruthy();
      await page.goto(`${origin()}/fr/products`);
      await page.evaluate(
        (item) =>
          localStorage.setItem(
            'bric:cart:v1',
            JSON.stringify([
              {
                productId: item.id,
                token: item.slug,
                title: item.title,
                imageUrl: null,
                unitPrice: 5000,
                quantity: 1,
                availabilityStatus: 'in_stock',
              },
            ]),
          ),
        product,
      );
      await page.goto(`${origin()}/fr/checkout`);
      await expect.poll(async () => (await cart(page)).length).toBe(0);
      await expect(page.locator('.checkout-submit')).toHaveCount(0);
    },
  );
  await ctx.test(
    'storefront-landing-checkout',
    'A published Arabic campaign page accepts a real mobile order and preserves campaign attribution',
    async ({ page, expect, save }) => {
      await page.setViewportSize({ width: 360, height: 740 });
      await page.goto(
        `${origin()}/ar/landing/qa-drill?utm_source=gauntlet&utm_campaign=${ctx.runId}`,
      );
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('.landing-order-section')).toBeVisible();
      await fillCheckout(page, email('landing'), 'ar');
      const order = await submit(page, expect, 'ar');
      await save('order.json', order);
      expect(Number(order.productSubtotal)).toBe(4500);
      await noOverflow(page, expect);
      const persisted = await ctx.query(
        `SELECT row_to_json(a) FROM order_acquisition_attribution a WHERE order_id=${Number(order.id)}`,
      );
      await save('persisted-order.json', { result: persisted });
      expect(String(persisted)).toContain(ctx.runId);
    },
  );
}
