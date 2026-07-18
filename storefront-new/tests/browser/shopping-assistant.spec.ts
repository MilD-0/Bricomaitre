import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const assistantResponse = {
  mode: 'ai',
  message: 'La perceuse à percussion est l’option la plus proche dans le catalogue. Vérifiez sa disponibilité sur la fiche.',
  products: [{
    id: 13,
    token: 'impact-drill',
    title: 'Perceuse à percussion',
    titleAr: 'مثقاب طرقي',
    description: 'Une perceuse compacte pour les travaux courants.',
    descriptionAr: 'مثقاب مدمج للأعمال اليومية.',
    price: '8900.00',
    oldPrice: null,
    inStock: false,
    availabilityStatus: 'out_of_stock',
    imageUrl: '/product-placeholder.svg?drill=1',
    brand: 'Bric Pro',
    category: 'Outillage',
  }],
};

test('offers a grounded, private product-advisor conversation in French', async ({ page }) => {
  const analyticsBodies: string[] = [];
  let assistantRequest: Record<string, unknown> | null = null;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/analytics')) analyticsBodies.push(request.postData() ?? '');
  });
  await page.route('**/api/ai/chat', async (route) => {
    assistantRequest = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(assistantResponse) });
  });

  await page.goto('/fr/products');
  await page.getByRole('button', { name: 'Trouver le bon outil' }).click();
  const advisor = page.getByRole('dialog', { name: 'Conseiller produits' });
  await expect(advisor).toBeVisible();
  await advisor.getByLabel('Votre question sur les produits').fill('Une perceuse privée pour du béton');
  await advisor.getByRole('button', { name: 'Envoyer la question' }).click();

  await expect(advisor.getByText(/option la plus proche/)).toBeVisible();
  await expect(advisor.getByRole('link', { name: /Perceuse à percussion/ })).toHaveAttribute('href', '/fr/products/impact-drill');
  expect(assistantRequest).toMatchObject({
    locale: 'fr',
    messages: [{ role: 'user', content: 'Une perceuse privée pour du béton' }],
  });
  await expect.poll(() => analyticsBodies.some((body) => body.includes('ai_assistant_message'))).toBe(true);
  expect(analyticsBodies.join(' ')).not.toContain('Une perceuse privée pour du béton');

  const accessibility = await new AxeBuilder({ page })
    .include('.shopping-assistant-sheet')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test('uses a real RTL mobile drawer and stays out of checkout', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'اعثر على الأداة المناسبة' }).click();
  const advisor = page.getByRole('dialog', { name: 'مستشار المنتجات' });
  await expect(advisor).toBeVisible();
  await expect.poll(() => advisor.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= window.innerWidth;
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(advisor).toHaveCount(0);

  await page.goto('/ar/checkout');
  await expect(page.getByRole('button', { name: 'اعثر على الأداة المناسبة' })).toHaveCount(0);
});
