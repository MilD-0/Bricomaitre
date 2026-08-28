import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('renders a fast, focused, accessible single-product campaign in French', async ({ page }) => {
  // The first development-server visit compiles this on-demand ISR route; the
  // production image is precompiled and remains covered by the performance gate.
  test.setTimeout(60_000);
  const analytics: Array<Record<string, unknown>> = [];
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    const text = message.text().toLowerCase();
    if (
      message.type() === 'error' &&
      (text.includes('hydration') ||
        text.includes('hydrated') ||
        text.includes('server rendered html'))
    )
      hydrationErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/analytics'))
      analytics.push(request.postDataJSON());
  });
  await page.goto('/fr/landing/lampe-atelier');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Éclairez chaque chantier' }),
  ).toBeVisible();
  await expect(page.getByText(/4[\s\u202f]?500/).first()).toBeVisible();
  await expect(page.getByText('En stock')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commander maintenant' })).toBeVisible();
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.locator('.site-navigation')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Promos' })).toHaveAttribute(
    'href',
    '/fr/products?discounted=1',
  );
  await expect(page.locator('.site-footer')).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 2, name: 'Finaliser votre commande' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Numéro de téléphone/ })).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.getByRole('button', { name: 'Commander maintenant' }).click();
  await expect(page).toHaveURL(/\/fr\/landing\/lampe-atelier#landing-order$/);
  await page.getByRole('textbox', { name: /Numéro de téléphone/ }).fill('0550000000');
  await page.getByRole('combobox', { name: /Wilaya/ }).selectOption('16');
  await page.getByRole('combobox', { name: /Commune/ }).selectOption('Alger Centre');
  await page.getByRole('textbox', { name: /Adresse complète/ }).fill('12 rue des Outils');
  await page.getByRole('button', { name: 'Confirmer ma commande' }).click();
  await expect(page).toHaveURL(/\/fr\/thank-you\?token=fixture-public-order-token-\d+-/, {
    timeout: 20_000,
  });
  await expect
    .poll(() =>
      analytics.some(
        (event) =>
          event.eventName === 'order_create_success' &&
          JSON.stringify(event).includes('"landingPageId":4') &&
          JSON.stringify(event).includes('"landingRevision":2'),
      ),
    )
    .toBe(true);
  expect(hydrationErrors).toEqual([]);
});

test('keeps the campaign usable in Arabic on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/ar/landing/lampe-atelier');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const title = page.getByRole('heading', { level: 1, name: 'أنِر كل مشروع' });
  await expect(title).toBeVisible();
  const mediaBox = await page.locator('.landing-hero-media').boundingBox();
  const titleBox = await title.boundingBox();
  expect(mediaBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(titleBox!.y).toBeGreaterThanOrEqual(mediaBox!.y + mediaBox!.height);
  await expect(page.getByRole('button', { name: 'اطلب الآن' })).toBeVisible();
  const mobileCta = page.locator('.landing-mobile-cta');
  await expect(mobileCta).toBeVisible();
  await expect(mobileCta).toHaveAttribute('data-visible', 'true');
  await expect(page.getByRole('heading', { level: 2, name: 'إتمام الطلب' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /رقم الهاتف/ })).toBeVisible();
  await page.getByRole('heading', { level: 2, name: 'إتمام الطلب' }).scrollIntoViewIfNeeded();
  await expect(mobileCta).toHaveAttribute('data-visible', 'false');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('labels a signed saved-revision preview before rendering the campaign', async ({ page }) => {
  const query = new URLSearchParams({
    previewRevision: '2',
    previewTimestamp: String(Date.now()),
    previewSignature: 'a'.repeat(64),
  });
  await page.goto(`/fr/landing-preview/lampe-atelier?${query.toString()}`);

  await expect(page.locator('.landing-preview-banner')).toContainText(
    'Aperçu sécurisé de la version enregistrée',
  );
  await expect(
    page.getByRole('heading', { level: 1, name: 'Éclairez chaque chantier' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Numéro de téléphone/ })).toBeVisible();
});
