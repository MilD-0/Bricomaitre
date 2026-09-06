import { expect, test } from '@playwright/test';

for (const locale of ['fr', 'ar']) {
  const refresh = locale === 'fr' ? 'Actualiser' : 'تحديث';
  test(`renders projected advertising spend in the ${locale} money chart`, async ({
    page,
  }, testInfo) => {
    await page.route('**/api/stats/workspace?**', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      if (body.data?.data?.kind === 'money') {
        body.data.data.performanceSeries = [
          {
            label: '2026-08-01',
            bucket: '2026-08-01',
            adCostDzd: 200,
            grossProfitDzd: 800,
            adjustedProfitDzd: 700,
            netProfitDzd: 500,
            trueProfitDzd: 450,
            isPartial: false,
          },
          {
            label: '2026-08-02',
            bucket: '2026-08-02',
            adCostDzd: 100,
            adCostDzdProjected: 300,
            grossProfitDzd: 900,
            adjustedProfitDzd: 800,
            netProfitDzd: 500,
            trueProfitDzd: 450,
            isPartial: true,
          },
        ];
      }
      await route.fulfill({ response, json: body });
    });
    await page.goto(`/${locale}/stats/time`, { waitUntil: 'load' });
    await page.getByRole('button', { name: refresh, exact: true }).click();
    const chart = page.locator('section[data-analytics-ai-focus="economics_timeline"]').first();
    const bars = chart.locator('.recharts-bar-rectangle path');
    await expect(bars).toHaveCount(2);
    for (const bar of await bars.all()) {
      const bounds = await bar.boundingBox();
      expect(bounds?.height).toBeGreaterThan(1);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`money-spend-${locale}.png`) });
  });

  test(`recovers ${locale} storefront detail failures and refreshes the recovered data`, async ({
    page,
  }, testInfo) => {
    let failed = true;
    let successes = 0;
    await page.route('**/api/stats/storefront-details?**', async (route) => {
      if (failed) {
        await route.fulfill({ status: 503, json: { error: 'Temporary reporting failure' } });
        return;
      }
      const response = await route.fetch();
      const body = await response.json();
      successes += 1;
      body.data.acquisitionSources = [
        { name: `Recovered source ${successes}`, sessions: 10, conversionRate: 20 },
      ];
      await route.fulfill({ response, json: body });
    });
    await page.goto(`/${locale}/stats/website`, { waitUntil: 'load' });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(
      locale === 'fr' ? 'Échec de la requête analytique.' : 'فشل طلب التحليلات.',
      { timeout: 30_000 },
    );
    await page.screenshot({ path: testInfo.outputPath(`storefront-detail-error-${locale}.png`) });
    failed = false;
    await alert.getByRole('button', { name: refresh, exact: true }).click();
    await expect(page.getByText('Recovered source 1')).toBeVisible();
    await expect(alert).toHaveCount(0);
    await page.getByRole('button', { name: refresh, exact: true }).click();
    await expect(page.getByText('Recovered source 2')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`storefront-detail-recovered-${locale}.png`),
    });
  });
}
