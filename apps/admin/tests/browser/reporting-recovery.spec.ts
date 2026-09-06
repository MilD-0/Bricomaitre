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
      await expect.poll(async () => (await bar.boundingBox())?.height ?? 0).toBeGreaterThan(1);
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
    const alert = page.locator('[data-admin-workspace="stats"]').getByRole('alert');
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
  test(`supports keyboard reporting disclosure and localized ${locale} geography`, async ({
    page,
  }, testInfo) => {
    const close = locale === 'fr' ? 'Fermer' : 'إغلاق';
    await page.route('**/api/stats/workspace?**', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const data = body.data.data;
      if (data.kind === 'catalog') {
        data.products = [
          {
            id: 'audit-product',
            title: 'Perceuse clavier',
            sku: 'AUDIT',
            categoryName: 'Outils',
            brandName: 'Bricomaitre',
            postedOrders: 30,
            postedUnits: 32,
            paidOrders: 18,
            paidUnits: 18,
            returnedOrders: 6,
            activeOrders: 4,
            terminalPaidRatePct: 75,
            costCoveragePct: 100,
            projectedContributionDzd: 12000,
            deliveryMedianHours: 48,
            deliverySamples: 24,
            metaAssociations: [],
            viewCount: 1200,
            addToCartCount: 100,
            checkoutCount: 40,
            websitePurchaseCount: 30,
            websiteConversionRate: 2.5,
            changes: { unitsPct: null },
          },
        ];
        data.geography.wilayas = [
          {
            wilayaId: 16,
            name: 'Alger',
            postedOrders: 30,
            activeOrders: 4,
            terminalPaidRatePct: 75,
            deliveryMedianHours: 48,
            averageAttempts: 1.2,
            untrackedOrders: 0,
            pipelineCodDzd: 0,
          },
        ];
      } else if (data.kind === 'search') {
        data.opportunities = [
          {
            query: 'Perceuse clavier',
            clicks: 1,
            impressions: 100,
            ctrPct: 1,
            position: 8,
            pages: 1,
            branded: false,
            benchmarkCtrPct: 5,
            potentialClicks: 4,
            opportunity: 'strikingDistance',
            topPages: [],
          },
        ];
      } else if (data.kind === 'assumptions') {
        data.costs = [
          {
            id: 42,
            name: 'Entrepôt clavier',
            amountDzd: 3000,
            period: 'monthly',
            startDate: '2026-08-01',
            endDate: null,
          },
        ];
      } else if (data.kind === 'acquisition') {
        data.entities.adsets = [
          { id: 'audit-adset', name: 'Campagne clavier', campaignName: 'Atelier' },
        ];
      }
      await route.fulfill({ response, json: body });
    });
    for (const [path, label] of [
      ['products', 'Perceuse clavier'],
      ['search', 'Perceuse clavier'],
      ['costs', 'Entrepôt clavier'],
      ['meta-ads', 'Campagne clavier'],
    ]) {
      await page.goto(`/${locale}/stats/${path}`, { waitUntil: 'load' });
      await page.getByRole('button', { name: refresh, exact: true }).click();
      const disclosure = page
        .getByRole('button', { name: new RegExp(`^${label}`) })
        .filter({ visible: true });
      await expect(disclosure).toHaveCount(1);
      await disclosure.focus();
      await page.keyboard.press('Enter');
      if (path === 'costs') {
        await expect(
          page.getByRole('textbox', { name: locale === 'fr' ? 'Nom' : 'الاسم', exact: true }),
        ).toHaveValue(label);
      } else {
        await expect(page.getByRole('dialog', { name: label, exact: true })).toBeVisible();
        await page.getByRole('dialog').getByRole('button', { name: close, exact: true }).click();
      }
      if (path === 'products') {
        const countryLabel =
          locale === 'fr'
            ? 'Volume de livraison en Algérie par wilaya'
            : 'حجم التوصيل في الجزائر حسب الولاية';
        await expect(page.getByRole('img', { name: countryLabel, exact: true })).toBeVisible();
        const region = page
          .locator('[data-map-hit-layer="north"] path')
          .filter({ has: page.locator('title', { hasText: /^Alger:/ }) });
        await region.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('tooltip')).toContainText(
          locale === 'fr' ? 'commandes expédiées' : 'طلبات مرسلة',
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        ).toBeLessThanOrEqual(1);
        await page.screenshot({ path: testInfo.outputPath(`geography-keyboard-${locale}.png`) });
      }
    }
  });
}
