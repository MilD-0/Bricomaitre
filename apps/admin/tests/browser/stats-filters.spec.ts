import { expect, test } from '@playwright/test';

test('stats filters fetch once without rerendering the server page and survive reload', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120_000);
  await page.goto('/en/stats/search?range=30d&grain=auto');
  await expect(page.locator('h1')).toBeVisible();

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

  const response = page.waitForResponse(
    (result) => result.url().includes('/api/stats/workspace?') && result.url().includes('range=7d'),
  );
  if (isMobile) {
    await page.locator('select[name="analytics-range"]').selectOption('7d');
  } else {
    await page.getByRole('button', { name: '7 days', exact: true }).click();
  }
  expect((await response).ok()).toBe(true);
  await expect(page).toHaveURL(/range=7d/);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(apiRequests).toEqual(['?range=7d&grain=auto&view=search']);
  expect(serverNavigations).toEqual([]);

  await page.reload();
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('select[name="analytics-range"]')).toHaveValue('7d');
  await expect(page).toHaveURL(/range=7d/);
});
