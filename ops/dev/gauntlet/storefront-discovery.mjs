export async function runStorefrontDiscovery({
  ctx,
  origin,
  cart,
  fillCheckout,
  email,
  submit,
  PHONE,
}) {
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
}
