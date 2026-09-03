import { expect, test } from '@playwright/test';

test('renders the production homepage hierarchy with responsive banner media', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/fr');
  const banner = page.getByRole('region', { name: 'Offres du moment' });
  await expect(banner).toBeVisible();
  await expect(banner.locator('source[media="(max-width: 620px)"]').first()).toHaveAttribute(
    'srcset',
    /portrait/,
  );
  await expect(banner.locator('.home-banner-picture').first()).toHaveClass(/is-ready/);
  await expect(banner.locator('.home-banner-picture').nth(1)).toHaveClass(/is-ready/);
  const bannerBox = await banner.locator('.home-banner-picture').first().boundingBox();
  expect(bannerBox).not.toBeNull();
  expect(bannerBox!.height).toBeCloseTo((bannerBox!.width * 21) / 50, 0);
  await expect(page.locator('.site-header .brand img')).toHaveAttribute('src', /^\/_next\/image\?/);
  const fontPreload = page.locator('link[rel="preload"][as="font"]');
  await expect(fontPreload).toHaveCount(1);
  await expect(fontPreload).toHaveAttribute('href', /^\/_next\/static\/media\//);
  expect(
    await page
      .locator('html')
      .evaluate((element) => getComputedStyle(element).getPropertyValue('--font-arabic')),
  ).toBe('');
  const bannerTrack = banner.locator('.home-banner-track');
  const initialBannerTransform = await bannerTrack.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await expect
    .poll(() => bannerTrack.evaluate((element) => getComputedStyle(element).transform), {
      timeout: 7_000,
      intervals: [1_000],
    })
    .not.toBe(initialBannerTransform);
  await expect(page.getByRole('heading', { name: 'Top produits' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acheter par catégorie' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Bien choisir pour mieux travailler' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nos marques' })).toBeVisible();
  await expect(page.locator('.home-category-carousel a').first()).toHaveAttribute(
    'href',
    /\/fr\/categories\//,
  );
  await expect(page.locator('.home-brand-carousel a').first()).toHaveAttribute(
    'href',
    /\/fr\/brands\//,
  );
  await expect(page.getByText('Les outils les plus appréciés en ce moment.')).toHaveCount(0);
  await expect(page.getByText('Trouvez plus vite ce qu’il vous faut.')).toHaveCount(0);
  const featuredHeaders = page.locator('.home-featured-heading');
  await expect(featuredHeaders).toHaveCount(2);
  const featuredLayout = await page
    .locator('.home-featured-groups > .home-section')
    .evaluateAll((sections) =>
      sections.map((section) => {
        const cta = section.querySelector('.home-featured-cta')!.getBoundingClientRect();
        const slider = section.querySelector('.home-product-carousel')!.getBoundingClientRect();
        return {
          cta,
          slider,
          display: getComputedStyle(section.querySelector('.home-featured-cta')!).display,
        };
      }),
    );
  for (const group of featuredLayout) {
    expect(group.cta.y).toBeGreaterThanOrEqual(group.slider.bottom);
    expect(group.display).toBe('flex');
  }
  const whiteFrames = await page
    .locator('.catalog-card-media, .home-category-carousel a > span, .home-editorial-media')
    .evaluateAll((elements) =>
      elements.every(
        (element) => getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)',
      ),
    );
  expect(whiteFrames).toBe(true);
  const marquee = page.locator('.home-brand-carousel > div');
  await page.locator('.home-brand-band').scrollIntoViewIfNeeded();
  const brandBand = await page.locator('.home-brand-band').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const leftHit = document.elementFromPoint(1, rect.top + rect.height / 2);
    const rightHit = document.elementFromPoint(
      document.documentElement.clientWidth - 2,
      rect.top + rect.height / 2,
    );
    return {
      left: rect.left,
      right: rect.right,
      viewport: document.documentElement.clientWidth,
      visibleAtLeftEdge: leftHit?.closest('.home-brand-band') === element,
      visibleAtRightEdge: rightHit?.closest('.home-brand-band') === element,
    };
  });
  expect(brandBand.left).toBeCloseTo(0, 0);
  expect(brandBand.right).toBeCloseTo(brandBand.viewport, 0);
  expect(brandBand.visibleAtLeftEdge).toBe(true);
  expect(brandBand.visibleAtRightEdge).toBe(true);
  const brandGeometry = await page.locator('.home-brand-carousel').evaluate((element) => ({
    viewport: element.clientWidth,
    track: element.firstElementChild?.scrollWidth ?? 0,
  }));
  expect(brandGeometry.track).toBeGreaterThan(brandGeometry.viewport * 2);
  await expect(page.locator('.home-brand-carousel a').first()).toHaveCSS('filter', 'none');
  await expect(page.locator('.home-brand-carousel a').first()).toHaveCSS('opacity', '1');
  const initialTransform = await marquee.evaluate((element) => getComputedStyle(element).transform);
  await page.waitForTimeout(1_200);
  const movingTransform = await marquee.evaluate((element) => getComputedStyle(element).transform);
  expect(movingTransform).not.toBe(initialTransform);
  await page.waitForTimeout(4_000);
  await expect
    .poll(() => marquee.evaluate((element) => getComputedStyle(element).transform))
    .not.toBe(movingTransform);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index, follow/);
});

test('keeps the Arabic homepage readable and within a small-phone viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'أفضل المنتجات' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'تسوق حسب الفئة' })).toBeVisible();
  const bannerTrack = page.locator('.home-banner-track');
  await expect(page.locator('.home-banner-viewport')).toHaveAttribute('dir', 'rtl');
  await expect(bannerTrack).toHaveCSS('transform', /^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
  const initialBannerPosition = await bannerTrack.evaluate(
    (element) => element.getBoundingClientRect().x,
  );
  await page.waitForTimeout(5_500);
  expect(await bannerTrack.evaluate((element) => element.getBoundingClientRect().x)).toBeCloseTo(
    initialBannerPosition,
    0,
  );
  const categoryCard = page.locator('.home-category-carousel a').first();
  const categoryGeometry = await categoryCard.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    imageHeight: element.querySelector('span')?.getBoundingClientRect().height ?? 0,
  }));
  expect(categoryGeometry.width).toBeLessThan(145);
  expect(categoryGeometry.imageHeight).toBeLessThanOrEqual(100);
  const brandCard = page.locator('.home-brand-carousel a').first();
  expect(
    await brandCard.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThanOrEqual(60);
  const featuredTitleSize = await page
    .locator('.home-product-carousel .catalog-card-body h2')
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(featuredTitleSize).toBeGreaterThanOrEqual(15);
  const editorialCard = page.locator('.home-editorial-card').first();
  const editorialDesign = await editorialCard.evaluate((element) => ({
    mediaHeight:
      element.querySelector('.home-editorial-media')?.getBoundingClientRect().height ?? 0,
    titleSize: Number.parseFloat(getComputedStyle(element.querySelector('h3')!).fontSize),
    actionColumns: getComputedStyle(element.querySelector('div > div')!).gridTemplateColumns.split(
      ' ',
    ).length,
  }));
  expect(editorialDesign.mediaHeight).toBeLessThanOrEqual(285);
  expect(editorialDesign.titleSize).toBeGreaterThanOrEqual(20);
  expect(editorialDesign.actionColumns).toBe(2);
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflows).toBe(false);
  const featuredLayout = await page
    .locator('.home-featured-groups > .home-section')
    .evaluateAll((sections) =>
      sections.map((section) => {
        const cta = section.querySelector('.home-featured-cta')!.getBoundingClientRect();
        const slider = section.querySelector('.home-product-carousel')!.getBoundingClientRect();
        return { cta, slider, viewport: document.documentElement.clientWidth };
      }),
    );
  expect(featuredLayout).toHaveLength(2);
  for (const group of featuredLayout) {
    expect(group.cta.x).toBeGreaterThanOrEqual(0);
    expect(group.cta.right).toBeLessThanOrEqual(group.viewport);
    expect(group.cta.y).toBeGreaterThanOrEqual(group.slider.bottom);
  }
});
