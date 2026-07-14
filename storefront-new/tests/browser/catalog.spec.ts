import { expect, test } from '@playwright/test';

test('provides responsive global navigation, forgiving suggestions, and a live cart badge', async ({ page }) => {
  const analyticsEvents: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/analytics')) {
      const eventName = request.postDataJSON()?.eventName;
      if (typeof eventName === 'string') analyticsEvents.push(eventName);
    }
  });
  await page.addInitScript(() => localStorage.setItem('bric:cart:v1', JSON.stringify([{
    productId: 12,
    token: 'desk-lamp',
    title: 'Lampe de travail',
    imageUrl: null,
    unitPrice: 4500,
    quantity: 3,
    availabilityStatus: 'in_stock',
  }])));

  await page.goto('/fr/products?brand=2');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Bricomaitre — accueil' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Panier: 3' })).toBeVisible();
  await expect(header.getByRole('link', { name: /العربية/ })).toHaveAttribute('href', '/ar/products?brand=2');

  const globalSearch = page.getByRole('combobox', { name: 'Rechercher des produits' });
  const globalSearchForm = page.locator('.global-search form');
  await globalSearchForm.hover();
  await expect(globalSearchForm).not.toHaveCSS('box-shadow', 'none');
  await expect(globalSearchForm.locator('button[type="submit"]')).not.toHaveCSS('transform', 'none');
  await globalSearch.fill('percuse');
  await expect(page.getByRole('link', { name: /Perceuse à percussion/ })).toBeVisible();
  await expect.poll(() => analyticsEvents).toContain('search');

  await page.setViewportSize({ width: 360, height: 740 });
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const navigationDrawer = page.getByRole('dialog', { name: 'Ouvrir le menu' });
  await expect(navigationDrawer).toBeVisible();
  await expect(navigationDrawer.getByRole('link', { name: 'Éclairage', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Ouvrir le menu' })).toHaveCount(0);
  await expect.poll(() => analyticsEvents).toContain('navigation_menu_open');
});

test('navigates from the cart to checkout and switches locale without losing the route', async ({ page }) => {
  await page.goto('/fr/products');
  await page.getByRole('button', { name: 'Panier: 0' }).click();
  const cartDrawer = page.getByRole('dialog', { name: 'Votre panier' });
  await expect(cartDrawer).toBeVisible();
  expect(await cartDrawer.evaluate((drawer) => drawer.parentElement?.parentElement === document.body)).toBe(true);
  await expect.poll(() => cartDrawer.evaluate((drawer) => {
    const bounds = drawer.getBoundingClientRect();
    return document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)?.closest('.cart-drawer') === drawer;
  })).toBe(true);
  await expect(cartDrawer.getByRole('heading', { name: 'Votre panier est vide' })).toBeVisible();
  await cartDrawer.getByRole('link', { name: 'Voir les produits' }).click();
  await page.getByRole('button', { name: 'Panier: 0' }).click();
  await page.evaluate(() => localStorage.setItem('bric:cart:v1', JSON.stringify([{
    productId: 12,
    token: 'desk-lamp',
    title: 'Lampe de travail',
    imageUrl: null,
    unitPrice: 4500,
    quantity: 1,
    availabilityStatus: 'in_stock',
  }])));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('bric:cart-updated')));
  await cartDrawer.getByRole('button', { name: 'Fermer le panier' }).click();
  await page.getByRole('button', { name: 'Panier: 1' }).click();
  await cartDrawer.getByRole('link', { name: 'Passer la commande' }).click();
  await expect(page).toHaveURL(/\/fr\/checkout$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Finaliser votre commande' })).toBeVisible();

  const arabic = page.getByRole('banner').getByRole('link', { name: 'العربية' });
  await expect(arabic).toHaveAttribute('href', '/ar/checkout');
  await arabic.click();
  await expect(page).toHaveURL(/\/ar\/checkout$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'إتمام الطلب' })).toBeVisible();
});

test('renders and filters the server-first French catalog with governed analytics', async ({ page }) => {
  const analyticsEvents: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/analytics')) {
      const eventName = request.postDataJSON()?.eventName;
      if (typeof eventName === 'string') analyticsEvents.push(eventName);
    }
  });

  const response = await page.goto('/fr/products');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Produits pour vos travaux' })).toBeVisible();
  await expect(page.locator('.catalog-results-heading').getByText('39 produits', { exact: true })).toBeVisible();
  const footer = page.locator('.site-footer');
  await expect(footer.getByRole('heading', { name: 'Nous contacter' })).toBeVisible();
  await expect(footer.getByRole('link', { name: '0778 81 03 60' })).toHaveAttribute('href', 'tel:+213778810360');
  await expect(footer.getByRole('link', { name: 'bricomaitre@gmail.com' })).toHaveAttribute('href', 'mailto:bricomaitre@gmail.com');
  await expect(footer.getByRole('link', { name: /BT N20/ })).toHaveAttribute('href', 'https://maps.app.goo.gl/MpAM58nHS2G5JBah8');
  await expect(footer.getByRole('link', { name: /Facebook/ })).toHaveAttribute('href', 'https://www.facebook.com/profile.php?id=61562272954715');
  const phoneLink = footer.getByRole('link', { name: '0778 81 03 60' });
  await phoneLink.scrollIntoViewIfNeeded();
  const animatedPhone = phoneLink.locator('.site-footer-contact-icon > div svg');
  await expect(animatedPhone).toBeVisible();
  await phoneLink.hover();
  await expect.poll(() => animatedPhone.evaluate((icon) => getComputedStyle(icon).transform), { intervals: [25, 50, 100] }).not.toBe('none');
  await expect(footer.getByRole('link', { name: 'Checkout' })).toHaveAttribute('href', '/fr/checkout');
  await expect(page.getByRole('heading', { level: 2, name: 'Lampe de travail' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Perceuse à percussion' })).toBeVisible();
  await expect(page.getByText('Catalogue', { exact: true })).toHaveCount(0);
  await expect(page.locator('.catalog-heading > span')).toHaveCount(0);
  await expect(page.locator('.catalog-toolbar')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.catalog-toolbar')).toHaveCSS('box-shadow', 'none');
  await expect(page.locator('.catalog-filters')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  const typography = await page.evaluate(() => ({
    family: getComputedStyle(document.body).fontFamily,
    headingWeight: Number(getComputedStyle(document.querySelector('.catalog-heading h1')!).fontWeight),
    cardWeight: Number(getComputedStyle(document.querySelector('.catalog-card-body h2')!).fontWeight),
  }));
  expect(typography.family).toContain('Inter');
  expect(typography.headingWeight).toBeLessThanOrEqual(850);
  expect(typography.cardWeight).toBeLessThanOrEqual(750);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'http://127.0.0.1:3003/fr/products');
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain('ItemList');
  expect(await page.locator('.catalog-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(3);
  const allCategories = page.getByRole('radio', { name: 'Toutes les catégories' });
  await expect(allCategories).toBeVisible();
  expect(await allCategories.evaluate((element) => ({
    borderRadius: getComputedStyle(element).borderRadius,
    borderWidth: getComputedStyle(element).borderWidth,
    width: getComputedStyle(element).width,
    checkedBackground: getComputedStyle(element).backgroundColor,
    checkedInset: getComputedStyle(element).boxShadow,
  }))).toEqual({
    borderRadius: '50%',
    borderWidth: '2px',
    width: '18px',
    checkedBackground: 'rgb(1, 115, 122)',
    checkedInset: expect.stringContaining('inset'),
  });
  await allCategories.hover();
  await expect(allCategories).toHaveCSS('transform', 'none');
  const filterLayout = await page.locator('.catalog-filters fieldset').evaluateAll((fieldsets) => fieldsets.map((fieldset) => {
    const heading = fieldset.querySelector('.catalog-filter-group-heading');
    const options = fieldset.querySelector('.catalog-filter-options');
    return {
      fieldsetOverflow: getComputedStyle(fieldset).overflowY,
      optionsOverflow: options ? getComputedStyle(options).overflowY : null,
      headingOutsideScroller: Boolean(heading && options && heading.parentElement === fieldset && options.parentElement === fieldset && !options.contains(heading)),
    };
  }));
  expect(filterLayout).toEqual([
    { fieldsetOverflow: 'visible', optionsOverflow: 'auto', headingOutsideScroller: true },
    { fieldsetOverflow: 'visible', optionsOverflow: 'auto', headingOutsideScroller: true },
  ]);
  await page.evaluate(() => window.scrollTo(0, 700));
  const stickyClearance = await page.evaluate(() => {
    const header = document.querySelector('.site-header')!.getBoundingClientRect();
    const filters = document.querySelector('.catalog-filters')!.getBoundingClientRect();
    return { headerBottom: header.bottom, filterTop: filters.top };
  });
  expect(stickyClearance.filterTop).toBeGreaterThanOrEqual(stickyClearance.headerBottom + 8);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => analyticsEvents).toContain('view_item_list');
  await expect(page.getByRole('navigation', { name: 'Pages du catalogue' })).toHaveCount(0);

  await page.getByRole('searchbox', { name: 'Recherche' }).fill('perceuse');
  await page.getByRole('button', { name: 'Afficher', exact: true }).click();
  await expect(page).toHaveURL(/q=perceuse/);
  await expect(page.getByRole('heading', { level: 2, name: 'Perceuse à percussion' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Lampe de travail' })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);
  await expect.poll(() => analyticsEvents).toContain('search');
});

test('preserves Arabic RTL, small-phone cards, and no-JavaScript discovery', async ({ page, browser }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/ar/products');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('radio', { name: 'كل الأصناف' })).toBeHidden();
  await page.getByText('تصفية المنتجات', { exact: true }).click();
  await expect(page.getByRole('radio', { name: 'كل الأصناف' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'مصباح العمل' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'مثقاب طرقي' })).toBeVisible();
  expect(await page.locator('.catalog-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
  const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);

  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 740 } });
  const noScriptPage = await context.newPage();
  await noScriptPage.goto('/fr/products');
  await expect(noScriptPage.getByRole('heading', { level: 2, name: 'Lampe de travail' })).toBeVisible();
  await expect(noScriptPage.getByRole('link', { name: 'Produits suivants' })).toBeVisible();
  await context.close();
});

test('searches live and forgives French typos and Arabic letter variants', async ({ page }) => {
  await page.goto('/fr/products');
  const frenchSearch = page.getByRole('searchbox', { name: 'Recherche' });
  await frenchSearch.fill('per');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('per');
  await expect(frenchSearch).toBeFocused();
  await frenchSearch.pressSequentially('cuse', { delay: 300 });

  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('percuse');
  await expect(frenchSearch).toBeFocused();
  await expect(page.getByRole('heading', { level: 2, name: 'Perceuse à percussion' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Lampe de travail' })).toHaveCount(0);

  await page.goto('/ar/products');
  await page.getByRole('searchbox', { name: 'البحث' }).fill('اداه');
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('اداه');
  await expect(page.getByRole('heading', { level: 2, name: /أداة ورشة/ }).first()).toBeVisible();
});

test('automatically appends products and preserves position across refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 740 });
  await page.goto('/fr/products');

  await page.getByRole('button', { name: 'Afficher plus de produits' }).scrollIntoViewIfNeeded();
  await expect(page.locator('[data-product-id="18"]').first()).toBeVisible();
  await page.locator('[data-product-id="18"]').scrollIntoViewIfNeeded();
  const savedY = await page.evaluate(() => window.scrollY);
  expect(savedY).toBeGreaterThan(500);
  await expect.poll(() => page.evaluate(() => {
    const raw = sessionStorage.getItem('bric:catalog-position:v2:/fr/products');
    return raw ? JSON.parse(raw).page : null;
  })).toBe(2);

  await page.reload();
  await expect(page.locator('[data-product-id="18"]').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
});

test('meets the catalog weak-phone first-content budget', async ({ page, context }) => {
  const session = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1_600_000 / 8,
    uploadThroughput: 750_000 / 8,
    connectionType: 'cellular4g',
  });
  await page.setViewportSize({ width: 360, height: 740 });

  const startedAt = Date.now();
  await page.goto('/fr/products', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Produits pour vos travaux' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Lampe de travail' })).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(8_000);
});
