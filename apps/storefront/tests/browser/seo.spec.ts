import { expect, test } from '@playwright/test';

test('serves crawl policy, merchant identity, and API-backed localized product discovery', async ({
  page,
  request,
}) => {
  const robotsResponse = await request.get('/robots.txt');
  expect(robotsResponse.ok()).toBe(true);
  const robots = await robotsResponse.text();
  expect(robots).toContain('Sitemap: http://127.0.0.1:3003/sitemap.xml');
  expect(robots).toContain('Disallow: /fr/checkout');
  expect(robots).toContain('Disallow: /ar/thank-you');

  const sitemapResponse = await request.get('/sitemap.xml');
  expect(sitemapResponse.ok()).toBe(true);
  const sitemap = await sitemapResponse.text();
  expect(sitemap).toContain('<loc>http://127.0.0.1:3003/fr</loc>');
  expect(sitemap).toContain('<loc>http://127.0.0.1:3003/ar/products</loc>');
  expect(sitemap).toContain('<loc>http://127.0.0.1:3003/fr/products/desk-lamp</loc>');
  expect(sitemap).toContain('hreflang="ar"');
  expect(sitemap).not.toContain('/checkout</loc>');
  expect(sitemap).not.toContain('/thank-you</loc>');

  const rootResponse = await request.get('/', { maxRedirects: 0 });
  expect(rootResponse.status()).toBe(307);
  expect(rootResponse.headers().location).toBe('/fr');

  const unfinishedCollectionResponse = await page.goto('/fr/collections/outillage');
  expect(unfinishedCollectionResponse?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Cette page n’existe plus' })).toBeVisible();

  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  await expect(manifestResponse.json()).resolves.toMatchObject({ start_url: '/fr', lang: 'fr-DZ' });
  for (const path of [
    '/favicon.ico',
    '/icon.png',
    '/apple-icon.png',
    '/icons/icon-192.png',
    '/icons/icon-maskable-512.png',
  ]) {
    expect((await request.get(path)).ok(), `${path} should be available`).toBe(true);
  }

  await page.goto('/fr/products/desk-lamp');
  await expect(page.getByText('Livraison rapide partout en Algérie')).toBeVisible();
  await expect(page.getByText('Retour gratuit avant ouverture')).toHaveCount(0);
  const structuredData = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '[]',
  );
  expect(structuredData[0].offers).toMatchObject({
    seller: { name: 'Bricomaitre' },
    shippingDetails: {
      shippingDestination: { addressCountry: 'DZ' },
      shippingRate: { currency: 'DZD', value: 800 },
    },
    hasMerchantReturnPolicy: {
      merchantReturnDays: 0,
      returnFees: 'https://schema.org/FreeReturn',
    },
  });
});
