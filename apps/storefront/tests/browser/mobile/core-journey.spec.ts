import { expect, type BrowserContext, type Page, test } from '@playwright/test';

async function expectPhoneEnvironment(page: Page) {
  const environment = await page.evaluate(() => ({
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    maxTouchPoints: navigator.maxTouchPoints,
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));

  expect(environment.coarsePointer).toBe(true);
  expect(environment.maxTouchPoints).toBeGreaterThan(0);
  expect(environment.documentWidth).toBeLessThanOrEqual(environment.viewportWidth);
}

async function swipeCarousel(page: Page, context: BrowserContext, selector: string) {
  const viewport = page.locator(selector).first();
  await viewport.scrollIntoViewIfNeeded();
  const before = await viewport
    .locator(':scope > div')
    .evaluate((element) => getComputedStyle(element).transform);
  const box = await viewport.boundingBox();
  expect(box).not.toBeNull();
  const session = await context.newCDPSession(page);
  const startX = box!.x + box!.width * 0.82;
  const endX = box!.x + box!.width * 0.18;
  const y = box!.y + box!.height * 0.5;
  const point = (x: number) => ({ x, y, radiusX: 2, radiusY: 2, force: 1, id: 1 });

  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(startX)],
  });
  for (let step = 1; step <= 12; step += 1) {
    const x = startX + ((endX - startX) * step) / 12;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(x)] });
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect
    .poll(() =>
      viewport.locator(':scope > div').evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe(before);
}

test('supports touch navigation, search, and homepage carousels', async ({ page, context }) => {
  await page.goto('/fr');
  await expectPhoneEnvironment(page);

  const headerIconAlignment = await page.locator('.site-header-primary').evaluate((header) =>
    [
      ...header.querySelectorAll<HTMLElement>(
        '.navigation-cart, .navigation-menu-button, .global-search form > button',
      ),
    ].map((button) => {
      const buttonBox = button.getBoundingClientRect();
      const iconBox = button.querySelector('svg')!.getBoundingClientRect();
      return {
        horizontal: Math.abs(
          iconBox.left + iconBox.width / 2 - (buttonBox.left + buttonBox.width / 2),
        ),
        vertical: Math.abs(
          iconBox.top + iconBox.height / 2 - (buttonBox.top + buttonBox.height / 2),
        ),
      };
    }),
  );
  expect(headerIconAlignment).toHaveLength(3);
  expect(
    headerIconAlignment.every((offset) => offset.horizontal <= 0.5 && offset.vertical <= 0.5),
  ).toBe(true);

  const search = page
    .getByRole('banner')
    .getByRole('combobox', { name: 'Rechercher des produits' });
  await expect(search).toBeVisible();
  await search.tap();
  await search.fill('lampe');
  await expect(page.locator('#global-search-results-header')).toBeVisible();
  await expect(
    page.locator('#global-search-results-header [data-search-result]').first(),
  ).toBeVisible();
  await search.fill('');

  await page.getByRole('button', { name: 'Ouvrir le menu' }).tap();
  const menu = page.getByRole('dialog', { name: 'Ouvrir le menu' });
  await expect(menu).toBeVisible();
  const drawerLocaleToggle = menu.getByRole('group', { name: 'Langue' });
  await expect(drawerLocaleToggle).toBeVisible();
  expect(
    await drawerLocaleToggle.evaluate(
      (element) =>
        getComputedStyle(element.querySelector('.navigation-locale-indicator')!).transitionProperty,
    ),
  ).toContain('transform');
  const drawerHeaderGeometry = await menu.locator('.mobile-sheet-header').evaluate((header) => {
    const title = header.querySelector('h2')!.getBoundingClientRect();
    const toggle = header
      .querySelector<HTMLElement>('.navigation-drawer-locale-toggle')!
      .getBoundingClientRect();
    return { toggleWidth: toggle.width, titleGap: toggle.left - title.right };
  });
  expect(drawerHeaderGeometry.toggleWidth).toBeLessThanOrEqual(80);
  expect(drawerHeaderGeometry.titleGap).toBeGreaterThanOrEqual(12);
  await expect(page.getByRole('button', { name: 'Panier: 0' })).toHaveCSS('border-radius', '50%');
  await expect
    .poll(() =>
      menu.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          document
            .elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
            ?.closest('[role="dialog"]') === element
        );
      }),
    )
    .toBe(true);
  const categoryGroups = menu.locator(
    '.navigation-drawer-links > details:first-of-type > div > .navigation-drawer-category-group',
  );
  await expect(categoryGroups).toHaveCount(2);
  const workshopGroup = categoryGroups.first();
  await expect(workshopGroup.locator(':scope > summary')).toContainText('Équipement d’atelier');
  await expect(workshopGroup.getByRole('link', { name: 'Éclairage' })).toBeHidden();
  await workshopGroup.locator(':scope > summary').tap();
  await expect(workshopGroup.locator('[data-category-self="5"]')).toHaveAttribute(
    'href',
    '/fr/categories/workshop-equipment',
  );
  await expect(workshopGroup.getByRole('link', { name: 'Éclairage' })).toBeVisible();

  await expect(menu.getByRole('combobox', { name: 'Rechercher des produits' })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Fermer le menu' }).tap();
  await expect(menu).toBeHidden();

  await swipeCarousel(page, context, '.home-category-carousel');
  await swipeCarousel(page, context, '.home-product-carousel');
  const productCardHeights = await page
    .locator('.home-product-carousel')
    .evaluateAll((carousels) =>
      carousels.map((carousel) =>
        [...carousel.querySelectorAll<HTMLElement>('.catalog-card')].map((card) =>
          Math.round(card.getBoundingClientRect().height),
        ),
      ),
    );
  expect(productCardHeights.every((heights) => new Set(heights).size === 1)).toBe(true);

  await page.goto('/fr/products');
  await page.getByRole('button', { name: 'Filtrer les produits' }).tap();
  const filters = page.getByRole('dialog', { name: 'Filtrer les produits' });
  await expect(filters).toBeVisible();
  const filterScroller = filters.locator('.mobile-sheet-body');
  const filterScrollState = await filterScroller.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
    touchAction: getComputedStyle(element).touchAction,
  }));
  expect(filterScrollState.scrollHeight).toBeGreaterThan(filterScrollState.clientHeight);
  expect(filterScrollState.overflowY).toBe('auto');
  expect(filterScrollState.touchAction).toBe('pan-y');
  const nestedOverflows = await filters
    .locator('.catalog-filter-options')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).overflowY));
  expect(nestedOverflows).toEqual(['visible', 'visible']);
  await filterScroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect
    .poll(() => filterScroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await filters.getByRole('radio', { name: 'Éclairage' }).tap();
  await filters.getByRole('button', { name: 'Appliquer les filtres' }).tap();
  await expect(page.getByRole('heading', { level: 1, name: 'Éclairage' })).toBeVisible({
    timeout: 10_000,
  });
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
    .toBe('/fr/categories/lighting');
});

test('completes the essential product and checkout journey by touch', async ({ page, context }) => {
  await page.goto('/fr/products/desk-lamp');
  await expectPhoneEnvironment(page);

  await expect(page.getByRole('img', { name: 'Lampe de travail — Photo 1' })).toBeVisible();
  await swipeCarousel(page, context, '.product-media-stage');
  await expect(page.getByRole('img', { name: 'Lampe de travail — Photo 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Photo 1' }).tap();
  await expect(page.getByRole('img', { name: 'Lampe de travail — Photo 1' })).toBeVisible();

  const zoomTrigger = page.getByRole('link', { name: 'Agrandir l’image' });
  const zoomTriggerGeometry = await zoomTrigger
    .locator('.product-media-zoom-label')
    .evaluate((label) => {
      const button = label.getBoundingClientRect();
      const icon = label.querySelector('svg')!.getBoundingClientRect();
      return {
        horizontalOffset: Math.abs(icon.left + icon.width / 2 - (button.left + button.width / 2)),
        verticalOffset: Math.abs(icon.top + icon.height / 2 - (button.top + button.height / 2)),
      };
    });
  expect(zoomTriggerGeometry.horizontalOffset).toBeLessThanOrEqual(1);
  expect(zoomTriggerGeometry.verticalOffset).toBeLessThanOrEqual(1);
  await zoomTrigger.tap();
  const zoom = page.getByRole('dialog', { name: 'Agrandir l’image — Lampe de travail' });
  await expect(zoom).toBeVisible();
  await expect(zoom.locator('.pswp__img').first()).toHaveCSS('object-fit', 'contain');
  await page.getByRole('button', { name: 'Fermer l’image agrandie' }).tap();
  await expect(zoom).toBeHidden();

  await page.getByRole('button', { name: 'Augmenter la quantité' }).tap();
  await expect(page.locator('.quantity-control output')).toHaveAttribute(
    'aria-label',
    'Quantité: 2',
  );

  const addToCart = page.getByRole('button', { name: 'Ajouter au panier' });
  expect((await addToCart.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await addToCart.tap();
  await expect(page.getByText('Produit ajouté au panier.')).toBeVisible();

  await page.getByRole('button', { name: /Panier:/ }).tap();
  const cart = page.getByRole('dialog', { name: 'Votre panier' });
  await expect(cart).toBeVisible();
  await expect(cart.locator('.cart-drawer-items > li')).toHaveCount(1);
  await cart.getByRole('button', { name: 'Fermer le panier' }).tap();

  await page.getByRole('button', { name: 'Ouvrir le menu' }).tap();
  const menu = page.getByRole('dialog', { name: 'Ouvrir le menu' });
  await expect(menu.getByRole('link', { name: 'Passer la commande' })).toHaveAttribute(
    'href',
    '/fr/checkout',
  );
  await menu.getByRole('button', { name: 'Fermer le menu' }).tap();

  const buyNow = page.getByRole('button', { name: 'Commander maintenant' });
  expect((await buyNow.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await buyNow.tap();
  await expect(page).toHaveURL(/\/fr\/checkout\?product=desk-lamp&quantity=2$/);

  const submit = page.getByRole('button', { name: 'Confirmer ma commande' });
  await expect(submit).toBeEnabled();
  await page.getByRole('textbox', { name: /Numéro de téléphone/ }).fill('0550000000');
  await page.getByRole('combobox', { name: /Wilaya/ }).selectOption('16');
  await page.getByRole('combobox', { name: /Commune/ }).selectOption('Alger Centre');
  await page.getByRole('textbox', { name: /Adresse complète/ }).fill('12 rue des Outils');
  await expect(page.getByRole('textbox', { name: /Numéro de téléphone/ })).toHaveValue(
    '0550000000',
  );
  await submit.tap();

  await expect(page).toHaveURL(/\/fr\/thank-you\?token=/, { timeout: 20_000 });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Merci pour votre commande !' }),
  ).toBeVisible();
  await expect(page.locator('.thank-you-summary').getByText('Lampe de travail')).toBeVisible();
  await expectPhoneEnvironment(page);
});

test('keeps the Arabic phone journey RTL and usable', async ({ page }) => {
  await page.goto('/ar/products/desk-lamp');
  await expectPhoneEnvironment(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

  const buyNow = page.getByRole('button', { name: 'اطلب الآن' });
  await expect(buyNow).toBeVisible();
  await buyNow.tap();
  await expect(page).toHaveURL(/\/ar\/checkout\?product=desk-lamp&quantity=1$/);
  await expect(page.getByRole('textbox', { name: /رقم الهاتف/ })).toBeVisible();
  await expectPhoneEnvironment(page);
});
