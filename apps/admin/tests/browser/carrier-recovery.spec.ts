import { expect, test } from '@playwright/test';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';
import fr from '../../messages/fr.json';

for (const [locale, messages] of Object.entries({ en, fr, ar })) {
  test(`resolves saved and uncertain carrier requests in ${locale}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const text = messages.ordersEcotrackManager.recovery;
    let items = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        orderId: 101,
        kind: 'update',
        provider: 'delivro',
        trackingNumber: 'TRACK-101',
        state: 'succeeded',
      },
      {
        id: '00000000-0000-4000-8000-000000000002',
        orderId: 102,
        kind: 'post',
        provider: 'emir',
        trackingNumber: null,
        state: 'uncertain',
      },
    ].map((item) => ({
      ...item,
      createdAt: '2026-01-01T00:00:00Z',
      canResolve: true,
      error: null,
      customer: 'Ahmed Benali',
      phone: '0550000011',
      amount: 1800,
      destination: 'Alger, Bab Ezzouar, 12 rue des Outils',
      products: 'Perceuse x1',
      content: null,
    }));
    let failedOnce = false;
    const actions: Array<Record<string, unknown>> = [];
    await page.route('**/api/orders/ecotrack/recovery', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { items } });
      const body = route.request().postDataJSON() as Record<string, unknown>;
      actions.push(body);
      if (body.action === 'confirm_applied' && !failedOnce) {
        failedOnce = true;
        return route.fulfill({
          status: 502,
          json: { error: 'Carrier verification unavailable. Retry.' },
        });
      }
      items = items.filter((item) => item.id !== body.operationId);
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(`/${locale}/orders/ecotrack`, { waitUntil: 'load' });
    const section = page.getByRole('region', { name: text.title });
    await expect(section).toBeVisible({ timeout: 30_000 });
    await section.getByRole('button', { name: text.review, exact: true }).first().click();
    await section.getByRole('button', { name: text.applySaved, exact: true }).click();
    await expect(section.getByRole('button', { name: text.review, exact: true })).toHaveCount(1);
    await section.getByRole('button', { name: text.review, exact: true }).click();
    const confirm = section.getByRole('button', { name: text.confirmApplied, exact: true });
    await expect(confirm).toBeDisabled();
    await section
      .getByLabel(text.evidence, { exact: true })
      .fill('Verified the order reference and amount in the carrier dashboard.');
    await section.getByLabel(text.tracking, { exact: true }).fill('RECOVERED-102');
    await expect(confirm).toBeEnabled();
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`carrier-recovery-${locale}.png`),
      fullPage: true,
    });
    await confirm.click();
    await expect(section.getByRole('alert')).toContainText(
      'Carrier verification unavailable. Retry.',
    );
    await expect(section.getByLabel(text.tracking, { exact: true })).toHaveValue('RECOVERED-102');
    await confirm.click();
    await expect(section).not.toBeVisible();
    expect(actions.map((action) => action.action)).toEqual([
      'apply_saved',
      'confirm_applied',
      'confirm_applied',
    ]);
  });
}
