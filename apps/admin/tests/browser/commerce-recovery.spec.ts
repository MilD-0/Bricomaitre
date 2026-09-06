import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { OrderRecord } from '../../lib/orders';
import ar from '../../messages/ar.json';
import fr from '../../messages/fr.json';

const order: OrderRecord = {
  id: 912340,
  publicToken: 'browser-token',
  ecotrackTrackingNumber: null,
  variant: null,
  isDegradedCapture: false,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-18T10:00:00.000Z',
  firstName: 'Browser',
  lastName: 'Customer',
  fullName: 'Browser Customer',
  email: null,
  phoneNumber1: '0550000111',
  phoneNumber2: null,
  cartProducts: ['912341'],
  orderProducts: [
    {
      productId: 912341,
      rawValue: '912341',
      title: 'Perceuse',
      unitPrice: 1200,
      quantity: 1,
      lineTotal: 1200,
      thumbnailUrl: null,
      missing: false,
    },
  ],
  delivery: 0,
  state: 16,
  city: 'Alger',
  homeAddress: '12 rue des outils',
  subtotalOverride: null,
  productSubtotal: 1200,
  deliveryFee: 500,
  totalAmount: 1700,
  promoCode: null,
  promoProductId: null,
  promoOriginalSubtotal: null,
  promoDiscountAmount: 0,
  promoFinalSubtotal: null,
  note: null,
  inHouseStatus: 0,
  noAnswerCount: 0,
  confirmedBy: null,
  confirmedByName: null,
  confirmedAt: null,
  hasStatusHistory: false,
  statusHistory: [],
};
const pagination = {
  page: 1,
  limit: 25,
  totalItems: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};
async function capture(page: Page, testInfo: TestInfo, locale: string, name: string) {
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await testInfo.attach(`${locale}-${name}`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
}
for (const [locale, messages] of [
  ['fr', fr],
  ['ar', ar],
] as const) {
  test(`${locale} keeps an order draft during background refresh and reloads explicitly`, async ({
    page,
  }, testInfo) => {
    await page.clock.install();
    let latest = order;
    await page.route('**/api/orders?*', (route) =>
      route.fulfill({ json: { items: [latest], pagination, writable: true } }),
    );
    await page.route(`**/api/orders/${order.id}`, (route) =>
      route.fulfill({ json: { ok: true, item: latest } }),
    );
    await page.route(`**/api/orders/${order.id}/customer`, (route) =>
      route.fulfill({ json: { completedOrderCount: 0 } }),
    );
    await page.goto(`/${locale}/orders`);
    await page
      .getByRole('searchbox', { name: messages.adminWorkspace.common.search })
      .fill('Browser');
    await page
      .getByRole('button', { name: /Browser Customer/ })
      .filter({ visible: true })
      .first()
      .click();
    const name = page.getByLabel(messages.ordersManager.name.label, { exact: true });
    await expect(name).toHaveValue('Browser Customer');
    await name.fill('Mon brouillon · مسودتي');
    latest = {
      ...order,
      firstName: 'Remote',
      fullName: 'Remote Customer',
      note: 'Remote note',
      updatedAt: '2026-09-06T12:00:00.000Z',
    };
    await page.clock.fastForward(31_000);
    const response = page.waitForResponse((r) => r.url().endsWith(`/api/orders/${order.id}`));
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      window.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      window.dispatchEvent(new Event('visibilitychange'));
    });
    await response;
    await expect(name).toHaveValue('Mon brouillon · مسودتي');
    await expect(page.getByText(messages.adminWorkspace.orders.changedElsewhere)).toBeVisible();
    await capture(page, testInfo, locale, 'order-draft');
    await page.getByRole('button', { name: messages.adminWorkspace.orders.loadLatest }).click();
    await expect(name).toHaveValue('Remote Customer');
    await expect(
      page.getByLabel(messages.adminWorkspace.orders.notes, { exact: true }),
    ).toHaveValue('Remote note');
  });

  test(`${locale} fetches the carrier filter immediately`, async ({ page }, testInfo) => {
    let reads = 0;
    await page.route('**/api/orders/ecotrack/recovery', (route) =>
      route.fulfill({ json: { items: [] } }),
    );
    await page.route('**/api/orders/ecotrack/shipments?*', (route) => {
      expect(new URL(route.request().url()).searchParams.get('status')).toBe('payed');
      reads++;
      return route.fulfill({
        json: {
          writable: true,
          pagination,
          items: [
            {
              ...order,
              orderId: order.id,
              reference: String(order.id),
              trackingNumber: 'BROWSER-PAID',
              provider: 'delivro',
              deliveryLabel: 'home',
              stateName: 'Alger',
              fullName: 'Paid Customer',
              status: {
                currentStatus: 'payed',
                driverPhone: null,
                estimatedFee: null,
                deskPhone: null,
                deskCommune: null,
                deskMapLink: null,
                deskAddress: null,
                lastStatusSyncedAt: null,
                lastTrackingSyncedAt: null,
                lastMajSyncedAt: null,
                isStatusStale: true,
                isTrackingStale: true,
                isMajStale: true,
              },
              canEdit: false,
              canDelete: false,
              canDispatch: false,
              canEditAndRecreate: false,
              canAddMaj: false,
              canAskReturn: false,
              canPrintLabel: false,
            },
          ],
        },
      });
    });
    await page.goto(`/${locale}/orders/ecotrack`);
    await page
      .getByRole('combobox', { name: messages.ordersEcotrackManager.filters.statusLabel })
      .selectOption('payed');
    await expect(page.getByText('BROWSER-PAID').filter({ visible: true })).toBeVisible({
      timeout: 5000,
    });
    expect(reads).toBe(1);
    await capture(page, testInfo, locale, 'carrier-filter');
  });

  test(`${locale} keeps queued exports visible and allows cancellation`, async ({
    page,
  }, testInfo) => {
    let cancelled = false;
    await page.route('**/api/products/export-all', (route) => {
      if (route.request().method() === 'DELETE') cancelled = true;
      return route.fulfill({
        json: {
          job: cancelled
            ? null
            : {
                id: 'browser-queued',
                status: 'queued',
                fileName: null,
                progress: { phase: 'queued', current: 0, total: 0, percentage: 0 },
                errorMessage: null,
                downloadPath: null,
              },
        },
      });
    });
    await page.goto(`/${locale}/products`);
    const cancel = page.getByRole('button', {
      name: messages.products.exportAll.cancel,
      exact: true,
    });
    await expect(cancel).toBeEnabled();
    await expect(
      page.getByText(messages.products.exportAll.progress.queued, { exact: true }),
    ).toBeVisible();
    await capture(page, testInfo, locale, 'queued-export');
    await cancel.click();
    await expect(cancel).toHaveCount(0);
    expect(cancelled).toBe(true);
  });

  test(`${locale} retains an accepted asset when refresh fails`, async ({ page }, testInfo) => {
    const copy =
      locale === 'fr'
        ? {
            create: 'Créer',
            save: 'Enregistrer',
            refresh: 'Actualiser la liste',
            failure: 'Enregistré. La liste n’a pas pu être actualisée.',
          }
        : {
            create: 'إنشاء',
            save: 'حفظ',
            refresh: 'تحديث القائمة',
            failure: 'تم الحفظ. تعذّر تحديث القائمة.',
          };
    let posts = 0;
    let failRefresh = true;
    let saved: Record<string, unknown> = {};
    await page.route('**/api/assets/product-options?*', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: 912341,
              title: 'Browser drill',
              slug: 'browser-drill',
              sku: null,
              imageUrl: null,
              active: true,
            },
          ],
          page: 1,
          limit: 12,
          total: 1,
          hasMore: false,
        },
      }),
    );
    await page.route('**/api/assets/featured-groups/resolve', (route) =>
      route.fulfill({ json: { items: [], total: 0 } }),
    );
    await page.route('**/api/assets', async (route) => {
      if (route.request().method() === 'POST') {
        posts++;
        saved = {
          ...route.request().postDataJSON().data,
          id: 912342,
          sortOrder: 0,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        };
        return route.fulfill({ json: { ok: true } });
      }
      return failRefresh
        ? route.fulfill({ status: 503, json: { error: 'Read unavailable' } })
        : route.fulfill({ json: { banners: [], featuredGroups: [saved], productCards: [] } });
    });
    await page.goto(`/${locale}/assets/featured-groups`);
    await page.getByRole('button', { name: copy.create, exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#asset2-group-name').fill('Browser group');
    await dialog.locator('#asset2-group-name-ar').fill('مجموعة اختبار');
    await dialog.getByRole('button', { name: /Browser drill/ }).click();
    await dialog.getByRole('button', { name: copy.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText(copy.failure);
    await expect(page.getByRole('button', { name: copy.create, exact: true })).toBeDisabled();
    await expect(page.getByText('Browser group', { exact: true })).toBeVisible();
    await capture(page, testInfo, locale, 'accepted-asset-refresh');
    failRefresh = false;
    await page.getByRole('button', { name: copy.refresh }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.create, exact: true })).toBeEnabled();
    expect(posts).toBe(1);
  });

  test(`${locale} preserves another landing page toggle after one fails`, async ({
    page,
  }, testInfo) => {
    const items = [true, false].map((active, index) => ({
      id: 912350 + index,
      productId: 912340 + index,
      productTitle: `Browser landing ${index}`,
      productSlug: `browser-${index}`,
      locale: 'fr',
      slug: `browser-${index}`,
      active,
      currentRevision: 1,
      updatedAt: order.updatedAt,
    }));
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/landing-pages?view=index', (route) =>
      route.fulfill({ json: { items } }),
    );
    await page.route('**/api/landing-pages/912350', async (route) => {
      await pending;
      await route.fulfill({ status: 409, json: { error: 'Revision conflict' } });
    });
    await page.route('**/api/landing-pages/912351', (route) =>
      route.fulfill({ json: { id: 912351, active: true, currentRevision: 1 } }),
    );
    await page.goto(`/${locale}/assets/landing-pages`);
    const first = page.getByRole('switch', { name: /Browser landing 0/ });
    const second = page.getByRole('switch', { name: /Browser landing 1/ });
    await first.click();
    await expect(first).toBeDisabled();
    await second.click();
    await expect(second).toBeEnabled();
    release();
    await expect(first).toBeEnabled();
    await expect(first).toBeChecked();
    await expect(second).toBeChecked();
    await capture(page, testInfo, locale, 'landing-toggle-recovery');
  });
}
