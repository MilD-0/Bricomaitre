const PHONE = '0550000081';

async function fillCheckout(page, email, locale = 'fr') {
  await page.locator('[name="phoneNumber1"]').fill(PHONE);
  await page.locator('[name="firstName"]').fill('Gauntlet');
  await page.locator('[name="lastName"]').fill('Storefront');
  await page.locator('[name="state"]').selectOption('16');
  await page.locator('[name="city"]').selectOption('Alger Centre');
  await page
    .locator('[name="homeAddress"]')
    .fill(locale === 'ar' ? '12 شارع الاختبار' : '12 rue du test');
  await page.locator('[name="email"]').fill(email);
}

async function cart(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('bric:cart:v1') ?? '[]'));
}

async function noOverflow(page, expect) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(2);
}

async function submit(page, expect, locale = 'fr') {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/orders' && r.request().method() === 'POST',
  );
  await page.locator('.checkout-submit').click();
  const result = await response;
  const body = await result.json();
  expect(result.status(), JSON.stringify(body)).toBe(201);
  await expect(page).toHaveURL(new RegExp(`/${locale}/thank-you\\?token=`), { timeout: 60000 });
  return body.item;
}

export async function run(ctx) {
  const origin = () => ctx.urls.storefront;
  const email = (id) => `sf-${id}-${ctx.runId}@example.invalid`;

  await ctx.test(
    'storefront-discovery',
    'French catalog search finds saleable products and excludes hidden products',
    async ({ page, expect, save }) => {
      await page.goto(`${origin()}/fr/products`);
      await expect(page.locator('.catalog-grid')).toBeVisible();
      await expect(
        page.locator('.catalog-grid a[href="/fr/products/qa-drill"]').first(),
      ).toBeVisible();
      await expect(page.locator('a[href="/fr/products/qa-hidden"]')).toHaveCount(0);
      const search = page
        .getByRole('banner')
        .getByRole('combobox', { name: 'Rechercher des produits' });
      await search.fill('vérification');
      const results = page.locator('#global-search-results-header');
      await expect(results.locator('a[href="/fr/products/qa-drill"]')).toBeVisible();
      await results.locator('a[href="/fr/products/qa-drill"]').click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Perceuse de vérification');
      await save('canonical.json', {
        canonical: await page.locator('link[rel="canonical"]').getAttribute('href'),
      });
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${origin()}/fr/products/qa-drill`,
      );
    },
  );

  await ctx.test(
    'storefront-taxonomy',
    'Category and brand routes preserve catalog selection after reload and locale switch',
    async ({ page, expect }) => {
      for (const path of ['/fr/categories/qa-tools', '/fr/brands/bric-qa']) {
        const response = await page.goto(`${origin()}${path}`);
        expect(response.status()).toBe(200);
        await expect(
          page.locator('.catalog-grid a[href="/fr/products/qa-drill"]').first(),
        ).toBeVisible();
        await expect(page.locator('a[href="/fr/products/qa-hidden"]')).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      }
      await page.getByRole('banner').getByRole('link', { name: 'العربية', exact: true }).click();
      await expect(page).toHaveURL(/\/ar\/brands\/bric-qa$/);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(
        page.locator('.catalog-grid a[href="/ar/products/qa-drill"]').first(),
      ).toBeVisible();
    },
  );

  await ctx.test(
    'storefront-price-filters',
    'Price and stock filters constrain real catalog results and sort survives reload',
    async ({ page, expect }) => {
      await page.goto(`${origin()}/fr/products?maxPrice=2000&stock=in`);
      await expect(page.locator('.catalog-grid > .catalog-card')).toHaveCount(1);
      await expect(
        page.locator('.catalog-grid a[href="/fr/products/qa-hammer"]').first(),
      ).toBeVisible();
      await page.getByRole('combobox', { name: 'Trier par' }).selectOption('price-desc');
      await expect.poll(() => new URL(page.url()).searchParams.get('sort')).toBe('price-desc');
      expect(new URL(page.url()).searchParams.get('maxPrice')).toBe('2000');
      expect(new URL(page.url()).searchParams.get('stock')).toBe('in');
      await page.reload();
      await expect(page.locator('.catalog-grid > .catalog-card')).toHaveCount(1);
      await expect(page.getByRole('combobox', { name: 'Trier par' })).toHaveValue('price-desc');
    },
  );

  await ctx.test(
    'storefront-unavailable',
    'Unavailable products cannot be purchased and hidden products cannot be reached directly',
    async ({ page, expect }) => {
      await page.goto(`${origin()}/fr/products/qa-unavailable`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Perceuse épuisée');
      await expect(page.locator('.product-unavailable-action')).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Commander maintenant', exact: true }),
      ).toHaveCount(0);
      await page.goto(`${origin()}/fr/products/qa-hidden`);
      await expect(
        page.getByRole('heading', { name: 'Nous n’avons pas trouvé ce produit' }),
      ).toBeVisible();
      await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute(
        'content',
        /noindex/,
      );
    },
  );

  await ctx.test(
    'storefront-cart-lifecycle',
    'Cart quantities, line totals and removal survive reloads',
    async ({ page, expect, save }) => {
      await page.goto(`${origin()}/fr/products/qa-drill`);
      await page.getByRole('button', { name: 'Augmenter la quantité', exact: true }).click();
      await page.getByRole('button', { name: 'Ajouter au panier', exact: true }).click();
      await expect.poll(async () => (await cart(page))[0]?.quantity).toBe(2);
      await page.reload();
      await page.getByRole('button', { name: 'Panier: 2', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Votre panier' });
      await expect(drawer.locator('.cart-drawer-item-copy strong')).toHaveText(
        /9[\s\u00a0\u202f]?000/,
      );
      await drawer.getByRole('button', { name: /^Augmenter/ }).click();
      await expect.poll(async () => (await cart(page))[0]?.quantity).toBe(3);
      await save('cart.json', await cart(page));
      await drawer.locator('.cart-drawer-remove').click();
      await expect(drawer.getByRole('heading', { name: 'Votre panier est vide' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Panier: 0', exact: true })).toBeVisible();
    },
  );

  await ctx.test(
    'storefront-checkout-validation',
    'Invalid phone and missing commune show recoverable errors without creating an order',
    async ({ page, expect }) => {
      let submissions = 0;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/api/orders' && request.method() === 'POST')
          submissions += 1;
      });
      await page.goto(`${origin()}/fr/checkout?product=qa-drill&quantity=1`);
      await page.locator('[name="phoneNumber1"]').fill('1234567890');
      await page.locator('[name="state"]').selectOption('16');
      await page.locator('[name="homeAddress"]').fill('12 rue du test');
      await page.locator('.checkout-submit').click();
      await expect(
        page.getByText('Saisissez un numéro de téléphone algérien valide à 10 chiffres.'),
      ).toBeVisible();
      await expect(page.getByText('Ce champ est obligatoire.')).toBeVisible();
      expect(submissions).toBe(0);
      await expect(page.locator('[name="homeAddress"]')).toHaveValue('12 rue du test');
      await fillCheckout(page, email('validation'));
      await submit(page, expect);
    },
  );

  await ctx.test(
    'storefront-draft-locale',
    'Checkout details and direct-product quantity survive reload and a language switch',
    async ({ page, expect }) => {
      await page.goto(`${origin()}/fr/checkout?product=qa-drill&quantity=2`);
      await fillCheckout(page, email('draft'));
      await expect
        .poll(() =>
          page.evaluate(
            () => JSON.parse(localStorage.getItem('bric:checkout:draft:v1') ?? '{}').phoneNumber1,
          ),
        )
        .toBe(PHONE);
      await page.reload();
      await expect(page.locator('[name="phoneNumber1"]')).toHaveValue(PHONE);
      await expect(page.locator('[name="city"]')).toHaveValue('Alger Centre');
      await page.getByRole('banner').getByRole('link', { name: 'العربية', exact: true }).click();
      await expect(page).toHaveURL(/\/ar\/checkout\?product=qa-drill&quantity=2$/);
      await expect(page.locator('[name="phoneNumber1"]')).toHaveValue(PHONE);
      await expect(page.locator('[name="city"]')).toHaveValue('Alger Centre');
      await expect(page.locator('[name="email"]')).toHaveValue(email('draft'));
    },
  );

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

  await ctx.test(
    'storefront-ai-link-origin',
    'Recorded model-output replay keeps commerce links on the current storefront',
    async ({ page, expect, save }) => {
      // Replay the live demo's actual prose. This tests the renderer without a model call.
      const markdown =
        '**Perceuse à percussion Milwaukee FUEL** — **40 450 DZD**, disponible.\n[Voir le produit](https://bricomaitre.dz/fr/products/catalog-esci-b079nbc7jn)';
      const stream =
        [
          { type: 'status', status: 'thinking' },
          { type: 'text-delta', delta: markdown },
          { type: 'result', products: [], cartMutations: [] },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n';
      await page.route('**/api/ai/chat', (route) =>
        route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: stream }),
      );
      await page.goto(`${origin()}/fr/products`);
      await page.getByRole('button', { name: 'Trouver le bon outil', exact: true }).click();
      const advisor = page.getByRole('dialog', { name: 'Conseiller produits' });
      await advisor
        .getByLabel('Votre question sur les produits')
        .fill(
          'Je cherche une perceuse. Donne une seule option disponible avec son prix exact et un lien.',
        );
      await advisor.getByRole('button', { name: 'Envoyer la question', exact: true }).click();
      const link = advisor.getByRole('link', { name: 'Voir le produit', exact: true });
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      await save('link-replay.json', {
        mode: 'recorded-model-output-replay',
        observedAt: '2026-09-05T19:00:21.758Z',
        observedOrigin: 'http://127.0.0.1:3402',
        currentOrigin: origin(),
        href,
        liveModelCalled: false,
        productionLinkFollowed: false,
      });
      expect(
        new URL(href, origin()).origin,
        'The local demo must not send a shopping customer to production',
      ).toBe(origin());
    },
  );

  await ctx.test(
    'storefront-ai-cart-stream-retry',
    'Injected transport loss after a cart result cannot make retry add the same unit twice',
    async ({ page, context, expect, save }) => {
      const response = await context.request.get(`${origin()}/api/catalog?q=vérification`);
      expect(response.ok()).toBeTruthy();
      const catalog = await response.json();
      const found = catalog.items.find((item) => item.slug === 'qa-drill');
      expect(found, 'The real product supplies the injected model result').toBeTruthy();
      const product = {
        id: found.id,
        token: found.slug,
        title: found.title,
        titleAr: found.titleAr ?? null,
        description: found.description ?? null,
        descriptionAr: found.descriptionAr ?? null,
        price: found.price,
        oldPrice: found.oldPrice ?? null,
        inStock: found.inStock,
        availabilityStatus: found.availabilityStatus,
        imageUrl: found.images?.[0] ?? null,
        brand: 'Bric QA',
        category: null,
      };
      const stream =
        [
          { type: 'text-delta', delta: 'Une perceuse ajoutée au panier.' },
          {
            type: 'result',
            products: [product],
            cartMutations: [{ action: 'add', quantity: 1, product }],
          },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n';
      await page.addInitScript(
        ({ body }) => {
          const nativeFetch = window.fetch.bind(window);
          window.__bricGauntletAiCalls = 0;
          window.fetch = async (input, options) => {
            const target =
              typeof input === 'string' || input instanceof URL ? String(input) : input.url;
            if (new URL(target, location.href).pathname !== '/api/ai/chat')
              return nativeFetch(input, options);
            window.__bricGauntletAiCalls += 1;
            if (window.__bricGauntletAiCalls > 1)
              return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
            const broken = new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(body));
                setTimeout(
                  () =>
                    controller.error(
                      new TypeError('Injected connection loss after final cart result'),
                    ),
                  200,
                );
              },
            });
            return new Response(broken, { headers: { 'content-type': 'application/x-ndjson' } });
          };
        },
        { body: stream },
      );
      await page.goto(`${origin()}/fr/products/qa-drill`);
      await page.getByRole('button', { name: 'Trouver le bon outil', exact: true }).click();
      const advisor = page.getByRole('dialog', { name: 'Conseiller produits' });
      await advisor
        .getByLabel('Votre question sur les produits')
        .fill('Ajoute une seule perceuse à mon panier.');
      await advisor.getByRole('button', { name: 'Envoyer la question', exact: true }).click();
      await expect.poll(async () => (await cart(page))[0]?.quantity).toBe(1);
      const retry = advisor.getByRole('button', { name: 'Réessayer', exact: true });
      await expect(advisor.locator('.shopping-assistant-conversation')).toHaveAttribute(
        'aria-busy',
        'false',
      );
      await save('after-interruption.json', {
        mode: 'injected-post-result-transport-failure',
        liveModelCalled: false,
        cart: await cart(page),
      });
      if (await retry.count()) {
        await retry.click();
        await expect.poll(() => page.evaluate(() => window.__bricGauntletAiCalls)).toBe(2);
        await expect(advisor.locator('.shopping-assistant-conversation')).toHaveAttribute(
          'aria-busy',
          'false',
        );
      }
      await expect(advisor.locator('.shopping-assistant-cart-updated')).toBeVisible();
      await expect(advisor.locator('.shopping-assistant-error')).toHaveCount(0);
      const finalCart = await cart(page);
      await save('after-retry.json', { cart: finalCart });
      expect(
        finalCart.find((item) => item.productId === found.id)?.quantity,
        'Retry must not duplicate an already applied cart action',
      ).toBe(1);
    },
  );
}
