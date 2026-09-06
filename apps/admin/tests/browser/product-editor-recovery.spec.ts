import { expect, test } from '@playwright/test';
import fr from '../../messages/fr.json';
import ar from '../../messages/ar.json';

const product = {
  id: 912345,
  title: 'Perceuse de vérification',
  titleAr: 'مثقاب للاختبار',
  slug: 'browser-editor-recovery',
  description: null,
  descriptionAr: null,
  sku: 'BROWSER-912345',
  barcode: null,
  price: 1200,
  oldPrice: null,
  purchasePrice: 700,
  active: true,
  inStock: true,
  availabilityStatus: 'in_stock',
  inventoryQuantity: 8,
  brandId: null,
  categoryId: null,
  images: [],
  promoCodes: [],
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-18T10:00:00.000Z',
  orderPurchaseCount: 0,
  confirmedOrderCount: 0,
  confirmationRate: null,
};

for (const [locale, messages] of [
  ['fr', fr],
  ['ar', ar],
] as const) {
  test(`${locale} preserves product edits and offers upload recovery`, async ({
    page,
  }, testInfo) => {
    let latest = product;
    let uploadAttempts = 0;
    await page.route('**/api/products?*', (route) =>
      route.fulfill({
        json: {
          items: [product],
          pagination: {
            page: 1,
            limit: 50,
            totalItems: 1,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      }),
    );
    await page.route('**/api/products/meta', (route) =>
      route.fulfill({ json: { brands: [], categories: [] } }),
    );
    await page.route(`**/api/products/${product.id}`, (route) =>
      route.fulfill({ json: { item: latest } }),
    );
    await page.route('**/api/uploads/products', async (route) => {
      uploadAttempts++;
      await route.fulfill(
        uploadAttempts === 1
          ? { status: 400, json: { error: 'Image invalide · صورة غير صالحة' } }
          : { json: { urls: ['https://cdn.example.com/verified.png'] } },
      );
    });
    await page.route('https://cdn.example.com/verified.png', (route) =>
      route.fulfill({
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGRkAAAAASUVORK5CYII=',
          'base64',
        ),
      }),
    );
    await page.goto(`/${locale}/products`);
    await page
      .getByRole('button', { name: `${messages.labels.actions} · ${product.title}` })
      .filter({ visible: true })
      .click();
    await page.getByRole('menuitem', { name: messages.actions.edit, exact: true }).click();
    const title = page.getByLabel(messages.labels.productName, { exact: true });
    await title.fill('Mon brouillon · مسودتي');
    latest = { ...product, title: 'Modification distante', updatedAt: '2026-09-06T12:00:00.000Z' };
    const detailResponse = page.waitForResponse(
      (response) => response.url().endsWith(`/api/products/${product.id}`),
      { timeout: 5000 },
    );
    // Headless tabs may remain visible; drive the same hidden-to-visible lifecycle.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      window.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await detailResponse;
    await expect(title).toHaveValue('Mon brouillon · مسودتي');
    await expect(page.getByText(messages.adminWorkspace.products.changedElsewhere)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${locale}-product-draft-conflict.png`) });
    await page.getByRole('button', { name: messages.adminWorkspace.products.loadLatest }).click();
    await expect(title).toHaveValue('Modification distante');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'invalid.png',
      mimeType: 'image/png',
      buffer: Buffer.from('invalid'),
    });
    await expect(page.getByText('Image invalide · صورة غير صالحة')).toBeVisible();
    await page
      .getByRole('button', { name: messages.uploadFields.retry, exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${locale}-upload-retry.png`) });
    await page.getByRole('button', { name: messages.uploadFields.retry, exact: true }).click();
    await expect(
      page.getByRole('button', { name: messages.uploadFields.retry, exact: true }),
    ).toHaveCount(0);
    expect(uploadAttempts).toBe(2);
    const deleteImage = page.getByRole('button', {
      name: messages.uploadFields.deleteImage.replace('{number}', '1'),
      exact: true,
    });
    await deleteImage.click();
    const confirmation = page.getByRole('dialog', { name: messages.uploadFields.deleteImageTitle });
    await expect(confirmation).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await confirmation.evaluate((element) => element.contains(document.activeElement))).toBe(
      true,
    );
    await expect
      .poll(() =>
        confirmation.evaluate((element) => {
          const motion = getComputedStyle(element.parentElement!);
          const overlay = getComputedStyle(element.parentElement!.parentElement!);
          return {
            opacity: motion.opacity,
            overlayOpacity: overlay.opacity,
            transform: motion.transform,
            filter: motion.filter,
          };
        }),
      )
      .toEqual({ opacity: '1', overlayOpacity: '1', transform: 'none', filter: 'blur(0px)' });
    await page.screenshot({ path: testInfo.outputPath(`${locale}-nested-image-confirmation.png`) });
    await page.keyboard.press('Escape');
    await expect(confirmation).not.toBeVisible();
    await expect(title).toHaveValue('Modification distante');
    await expect(deleteImage).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.keyboard.press('Escape');
    await expect(title).not.toBeVisible();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
}
