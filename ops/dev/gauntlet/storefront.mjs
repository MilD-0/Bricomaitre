import { runStorefrontAssistant } from './storefront-assistant.mjs';
import { runStorefrontCheckout } from './storefront-checkout.mjs';
import { runStorefrontDiscovery } from './storefront-discovery.mjs';
const PHONE = '0550000081';

async function fillCheckout(page, email, locale = 'fr') {
  await page.locator('[name="phoneNumber1"]').fill(PHONE);
  await page.locator('[name="firstName"]').fill('Gauntlet');
  await page.locator('[name="lastName"]').fill('Storefront');
  await page.locator('[name="state"]').selectOption('16');
  await page.locator('[name="city"]').selectOption('Alger Centre');
  await page
    .locator('[name="homeAddress"]')
    .fill(locale === 'ar' ? '12 شارع الاختبار' : '12 rue du test');
  await page.locator('[name="email"]').fill(email);
}

async function cart(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('bric:cart:v1') ?? '[]'));
}

async function noOverflow(page, expect) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(2);
}

async function submit(page, expect, locale = 'fr') {
  const response = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/orders' && r.request().method() === 'POST',
  );
  await page.locator('.checkout-submit').click();
  const result = await response;
  const body = await result.json();
  expect(result.status(), JSON.stringify(body)).toBe(201);
  await expect(page).toHaveURL(new RegExp(`/${locale}/thank-you\\?token=`), { timeout: 60000 });
  return body.item;
}

export async function run(ctx) {
  const origin = () => ctx.urls.storefront;
  const email = (id) => `sf-${id}-${ctx.runId}@example.invalid`;
  await runStorefrontDiscovery({ ctx, origin, cart, fillCheckout, email, submit, PHONE });
  await runStorefrontCheckout({
    ctx,
    origin,
    cart,
    fillCheckout,
    email,
    submit,
    PHONE,
    noOverflow,
  });
  await runStorefrontAssistant({ ctx, origin, cart });
}
