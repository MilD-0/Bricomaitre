import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { createFixtureOrder } from './helpers/order-fixture';

type Locale = 'fr' | 'ar';
type Surface = 'homepage' | 'catalog' | 'product' | 'checkout' | 'thank-you';

const surfacePaths: Record<Exclude<Surface, 'thank-you'>, (locale: Locale) => string> = {
  homepage: (locale) => `/${locale}`,
  catalog: (locale) => `/${locale}/products`,
  product: (locale) => `/${locale}/products/desk-lamp`,
  checkout: (locale) => `/${locale}/checkout?product=desk-lamp&quantity=1`,
};

const readyNames: Record<Surface, Record<Locale, RegExp>> = {
  homepage: { fr: /Top produits/, ar: /أفضل المنتجات/ },
  catalog: { fr: /Produits pour vos travaux/, ar: /منتجات لأعمالك/ },
  product: { fr: /Lampe de travail/, ar: /مصباح العمل/ },
  checkout: { fr: /Finaliser votre commande/, ar: /إتمام الطلب/ },
  'thank-you': { fr: /Merci pour votre commande/, ar: /شكرا على طلبك/ },
};

function formatViolations(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({ target: node.target, failureSummary: node.failureSummary })),
  }));
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  if (results.violations.length > 0) {
    throw new Error(JSON.stringify(formatViolations(results.violations), null, 2));
  }
}

for (const locale of ['fr', 'ar'] as const) {
  const mobile = locale === 'ar';
  for (const surface of ['homepage', 'catalog', 'product', 'checkout', 'thank-you'] as const) {
    test(`${surface} has no WCAG A/AA violations in ${locale} ${mobile ? 'mobile' : 'desktop'}`, async ({ page, request }) => {
      await page.setViewportSize(mobile ? { width: 360, height: 740 } : { width: 1440, height: 900 });

      let path: string;
      if (surface === 'thank-you') {
        const order = await createFixtureOrder(request);
        path = `/${locale}/thank-you?orderId=${order.id}&token=${encodeURIComponent(order.publicToken)}`;
      } else {
        path = surfacePaths[surface](locale);
      }

      await page.goto(path);
      const headingLevel = surface === 'homepage' ? 2 : 1;
      await expect(page.getByRole('heading', { level: headingLevel, name: readyNames[surface][locale] }).first()).toBeVisible();
      await expectAccessible(page);
    });
  }
}
