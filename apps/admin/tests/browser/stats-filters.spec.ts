import { expect, test, type Response } from '@playwright/test';

test('stats filters fetch once without rerendering the server page and survive reload', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  // Hold JavaScript so this proves the server-rendered controls cannot lose an
  // interaction on a slow device or network before hydration finishes.
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route(/\/_next\/static\/.*\.js(?:\?.*)?$/, async (route) => {
    await scriptsReady;
    await route.continue();
  });
  const rangeControl = isMobile
    ? page.locator('select[name="analytics-range"]')
    : page.getByRole('button', { name: '7 days', exact: true });
  try {
    await page.goto('/en/stats/search?range=30d&grain=auto', { waitUntil: 'commit' });
    await expect(page.locator('h1')).toBeVisible();
    await expect(rangeControl).toBeDisabled();
  } finally {
    releaseScripts();
  }
  await expect(rangeControl).toBeEnabled({ timeout: 30_000 });

  const apiRequests: string[] = [];
  const serverNavigations: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    // The initial 30-day snapshot may be stale and refresh in the background.
    // Count only requests for the range selected by this interaction.
    if (url.pathname === '/api/stats/workspace' && url.searchParams.get('range') === '7d') {
      apiRequests.push(url.search);
    }
    if (
      url.pathname === '/en/stats/search' &&
      (request.isNavigationRequest() || request.headers().rsc === '1')
    ) {
      serverNavigations.push(url.search);
    }
  });

  let filterResponse: Response | undefined;
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname === '/api/stats/workspace' && url.searchParams.get('range') === '7d') {
      filterResponse = response;
    }
  });
  if (isMobile) {
    await rangeControl.selectOption('7d');
  } else {
    await rangeControl.click();
  }
  // Fail at the interaction if it did not reach React, instead of spending the
  // whole test timeout waiting for a request that was never sent.
  await expect(page).toHaveURL(/range=7d/);
  await expect.poll(() => filterResponse?.ok(), { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(apiRequests).toEqual(['?range=7d&grain=auto&view=search']);
  expect(serverNavigations).toEqual([]);

  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('select[name="analytics-range"]')).toHaveValue('7d');
  await expect(page).toHaveURL(/range=7d/);
});
