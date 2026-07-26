import { expect, test } from '@playwright/test';

test('renders the French product journey with SEO and governed analytics', async ({ page }) => {
  const analyticsEvents: string[] = [];
  const analyticsLists: string[] = [];
  const analyticsPayloads: Array<Record<string, unknown>> = [];
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrated|hydration/i.test(message.text())) hydrationErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/analytics')) {
      const payload = request.postDataJSON() as Record<string, unknown> | null;
      if (payload) analyticsPayloads.push(payload);
      const eventName = payload?.eventName;
      if (typeof eventName === 'string') analyticsEvents.push(eventName);
      const metadata = payload?.metadata as Record<string, unknown> | undefined;
      const listContext = metadata?.listContext;
      if (typeof listContext === 'string') analyticsLists.push(listContext);
    }
  });

  const response = await page.goto('/fr/products/desk-lamp?fbclid=browser-click&utm_source=facebook&utm_medium=paid_social&private=discard-me');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Lampe de travail' })).toBeVisible();
  const productHeading = page.getByRole('heading', { level: 1, name: 'Lampe de travail' });
  const productHeadingWeight = Number(await productHeading.evaluate((element) => getComputedStyle(element).fontWeight));
  expect(productHeadingWeight).toBeGreaterThanOrEqual(600);
  expect(productHeadingWeight).toBeLessThanOrEqual(650);
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--brand-teal').trim())).toBe('#01737a');
  expect(await page.locator('body').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(245, 245, 243)');
  expect(await page.locator('.product-media-stage').evaluate((element) => getComputedStyle(element).getPropertyValue('corner-shape'))).toBe('squircle');
  expect(await page.locator('.product-price-block strong').evaluate((element) => getComputedStyle(element).color)).toBe('rgb(24, 114, 74)');
  expect(await page.locator('.navigation-cart').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(1, 115, 122)');
  await expect(page.getByText('4 500')).toBeVisible();
  const priceBox = await page.locator('.product-price-block').boundingBox();
  const availabilityBox = await page.locator('.availability').boundingBox();
  expect(priceBox && availabilityBox && Math.abs(priceBox.y - availabilityBox.y)).toBeLessThan(24);
  await expect(page.getByRole('button', { name: 'Ajouter au panier' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Bric Pro' })).toBeVisible();
  const brandContainerBox = await page.locator('.product-brand-logo').boundingBox();
  const brandImageBox = await page.getByRole('img', { name: 'Bric Pro' }).boundingBox();
  expect(brandContainerBox && brandImageBox && brandContainerBox.width - brandImageBox.width).toBeLessThan(10);
  expect(await page.locator('.product-brand-logo').evaluate((element) => getComputedStyle(element).borderWidth)).toBe('0px');
  expect(await page.locator('.product-brand-logo').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  const mediaStageBox = await page.locator('.product-media-stage').boundingBox();
  const mediaImageBox = await page.locator('.product-media-zoom-trigger > img').boundingBox();
  expect(mediaStageBox && mediaImageBox && mediaImageBox.x >= mediaStageBox.x && mediaImageBox.y >= mediaStageBox.y).toBe(true);
  expect(mediaStageBox && mediaImageBox && mediaImageBox.x + mediaImageBox.width <= mediaStageBox.x + mediaStageBox.width + 1).toBe(true);
  expect(mediaStageBox && mediaImageBox && mediaImageBox.y + mediaImageBox.height <= mediaStageBox.y + mediaStageBox.height + 1).toBe(true);
  const buyNow = page.getByRole('button', { name: 'Commander maintenant' });
  await expect(buyNow).toHaveClass(/button-primary/);
  await expect(buyNow).toBeVisible();
  expect(await buyNow.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(242, 106, 33)');
  expect(await page.getByRole('button', { name: 'Ajouter au panier' }).evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(1, 115, 122)');
  const flattenedCommerce = await page.evaluate(() => {
    const styles = (selector: string) => {
      const style = getComputedStyle(document.querySelector(selector)!);
      return {
        background: style.backgroundColor,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        inlineBorder: style.borderInlineStartWidth,
      };
    };
    return { actions: styles('.product-actions'), trust: styles('.product-trust') };
  });
  expect(flattenedCommerce).toEqual({
    actions: { background: 'rgba(0, 0, 0, 0)', borderRadius: '0px', boxShadow: 'none', inlineBorder: '0px' },
    trust: { background: 'rgba(0, 0, 0, 0)', borderRadius: '0px', boxShadow: 'none', inlineBorder: '0px' },
  });
  await expect(page.locator('.product-trust')).toHaveCSS('border-top-width', '1px');
  await expect(page.locator('.product-trust svg')).toHaveCount(3);
  const firstTrustIcon = page.locator('.product-trust li').first().locator('svg');
  await page.locator('.product-trust li').first().hover();
  await expect.poll(() => firstTrustIcon.evaluate((element) => getComputedStyle(element).transform)).not.toBe('none');
  const breadcrumbs = page.getByRole('navigation', { name: 'Fil d’Ariane' });
  await expect(breadcrumbs.getByRole('link', { name: 'Équipement d’atelier' })).toHaveAttribute('href', '/fr/categories/workshop-equipment');
  await expect(breadcrumbs.getByRole('link', { name: 'Éclairage' })).toHaveAttribute('href', '/fr/categories/lighting');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'http://127.0.0.1:3003/fr/products/desk-lamp');
  await expect(page.locator('link[hreflang="ar"]')).toHaveAttribute('href', 'http://127.0.0.1:3003/ar/products/desk-lamp');
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(jsonLd ?? '[]')[0]).toMatchObject({ '@type': 'Product', offers: { priceCurrency: 'DZD' } });

  await page.getByRole('button', { name: 'Augmenter la quantité' }).click();
  await expect(page.locator('.quantity-control output')).toHaveAttribute('aria-label', 'Quantité: 2');
  await expect(page.locator('.quantity-control number-flow-react')).toHaveAttribute('aria-hidden', 'true');
  await page.getByRole('button', { name: 'Ajouter au panier' }).click();
  await expect(page.getByText('Produit ajouté au panier.')).toBeVisible();
  await expect.poll(() => analyticsEvents).toContain('view_item');
  await expect.poll(() => analyticsEvents).toContain('add_to_cart');
  const viewItemPayload = analyticsPayloads.find((payload) => payload.eventName === 'view_item');
  const viewItemMetadata = viewItemPayload?.metadata as Record<string, unknown> | undefined;
  expect(viewItemPayload?.visitId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(viewItemPayload).toMatchObject({
    utmSource: 'facebook',
    utmMedium: 'paid_social',
  });
  expect(viewItemMetadata).toMatchObject({
    fbc: expect.stringContaining('browser-click'),
    paidClickCookie: true,
    metaTracking: {
      eventName: 'ViewContent',
      pixel: { invoked: false },
    },
  });
  expect(viewItemMetadata?.landingUrl).toContain('fbclid=browser-click');
  expect(viewItemMetadata?.landingUrl).not.toContain('private=discard-me');

  await page.getByRole('link', { name: 'Agrandir l’image' }).click();
  const zoom = page.getByRole('dialog', { name: 'Agrandir l’image — Lampe de travail' });
  await expect(zoom).toBeVisible();
  await expect(zoom.locator('.pswp__img').first()).toHaveCSS('object-fit', 'contain');
  await expect(zoom.locator('.pswp__img').first()).toHaveCSS('object-position', '50% 50%');
  await expect(zoom.locator('.pswp__button')).toHaveCount(0);
  await expect(zoom.locator('.product-lightbox-control')).toHaveCount(4);
  await expect(zoom).toContainText('1/2');
  await zoom.getByRole('button', { name: 'Agrandir l’image' }).click();
  await expect(zoom).toHaveClass(/pswp--zoomed-in/);
  await page.keyboard.press('ArrowRight');
  await expect(zoom).toContainText('2/2');
  await page.getByRole('button', { name: 'Fermer l’image agrandie' }).click();
  await expect(zoom).not.toBeVisible();
  await expect.poll(() => analyticsEvents).toContain('view_item_media');
  const similar = page.getByRole('region', { name: 'Produits similaires' });
  await expect(similar).toBeVisible();
  await expect(similar.locator('.similar-products-heading').getByRole('heading', { name: 'Produits similaires' })).toBeVisible();
  await expect(similar.locator('.similar-products-heading p, .similar-products-heading span')).toHaveCount(0);
  await expect(similar.getByRole('heading', { level: 2, name: 'Projecteur de chantier sur trépied' })).toBeVisible();
  await expect(similar.getByRole('heading', { level: 2, name: 'Lampe de travail' })).toHaveCount(0);
  await similar.scrollIntoViewIfNeeded();
  await expect.poll(() => similar.locator('.catalog-card').count()).toBeGreaterThan(6);
  await expect.poll(() => analyticsLists).toContain('similar_products');
  expect(hydrationErrors).toEqual([]);
});

test('preserves Arabic RTL and narrow-phone usability', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/ar/products/desk-lamp');

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1, name: 'مصباح العمل' })).toBeVisible();
  const mobileBuyNow = page.getByRole('button', { name: 'اطلب الآن' });
  await expect(mobileBuyNow).toBeVisible();
  expect(await mobileBuyNow.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
  const mobileActionDock = await page.locator('.product-action-buttons').evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { position: style.position, bottom: style.bottom, background: style.backgroundColor };
  });
  expect(mobileActionDock).toEqual({ position: 'fixed', bottom: '0px', background: 'rgb(255, 255, 255)' });
  const mobileBuyBox = await mobileBuyNow.boundingBox();
  expect(mobileBuyBox && mobileBuyBox.y + mobileBuyBox.height).toBeLessThanOrEqual(740);
  const widths = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
  expect(widths.body).toBeLessThanOrEqual(widths.viewport);

  await page.getByRole('link', { name: 'تكبير الصورة' }).click();
  const zoom = page.getByRole('dialog', { name: 'تكبير الصورة — مصباح العمل' });
  await expect(zoom.getByRole('button', { name: 'الصورة السابقة' })).toBeVisible();
  await expect(zoom.getByRole('button', { name: 'الصورة التالية' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(zoom).not.toBeVisible();
});

test('redirects legacy tokens and distinguishes missing from unavailable products', async ({ page }) => {
  await page.goto('/fr/products/legacy-lamp');
  await expect(page).toHaveURL(/\/fr\/products\/desk-lamp$/);

  const missing = await page.goto('/fr/products/missing');
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Nous n’avons pas trouvé ce produit' })).toBeVisible();
  await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute('content', /noindex/);

  const unavailable = await page.goto('/fr/products/unavailable');
  expect(unavailable?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Impossible de charger ce produit' })).toBeVisible();
});

test('keeps essential product content useful without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  await page.goto('/fr/products/desk-lamp');

  await expect(page.getByRole('heading', { level: 1, name: 'Lampe de travail' })).toBeVisible();
  await expect(page.getByText('Une lumière stable et puissante', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.product-summary .availability').getByText('En stock')).toBeVisible();
  await context.close();
});

test('meets the weak-phone first-content budget under CPU and network throttling', async ({ page, context }) => {
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
  await page.goto('/fr/products/desk-lamp', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Lampe de travail' })).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(8_000);
});
