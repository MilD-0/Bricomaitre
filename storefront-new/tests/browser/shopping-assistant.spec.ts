import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const assistantResponse = {
  mode: 'ai',
  message: 'La perceuse à percussion est l’option la plus proche dans le catalogue. Vérifiez sa disponibilité sur la fiche.\n\n| Critère | Valeur |\n| --- | --- |\n| Usage | Travaux courants |\n| Disponibilité | À vérifier sur la fiche |',
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

const assistantStreamBody = [
  { type: 'status', status: 'thinking' },
  { type: 'text-delta', delta: assistantResponse.message.slice(0, 70) },
  { type: 'text-delta', delta: assistantResponse.message.slice(70) },
  { type: 'result', mode: assistantResponse.mode, products: assistantResponse.products },
].map((event) => JSON.stringify(event)).join('\n') + '\n';

test('offers a grounded, private product-advisor conversation in French', async ({ page }) => {
  await page.setViewportSize({ width: 486, height: 870 });
  const analyticsBodies: string[] = [];
  let assistantRequest: Record<string, unknown> | null = null;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/analytics')) analyticsBodies.push(request.postData() ?? '');
  });
  await page.route('**/api/ai/chat', async (route) => {
    assistantRequest = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: assistantStreamBody });
  });

  await page.goto('/fr/products');
  const launcher = page.getByRole('button', { name: 'Trouver le bon outil' });
  await expect(launcher).toBeVisible({ timeout: 10_000 });
  await launcher.click();
  const advisor = page.getByRole('dialog', { name: 'Conseiller produits' });
  await expect(advisor).toBeVisible();
  const newChat = advisor.getByRole('button', { name: 'Nouvelle discussion' });
  const close = advisor.getByRole('button', { name: 'Fermer le conseiller' });
  const liveCatalog = advisor.getByText('Catalogue en direct');
  await expect(newChat.locator('xpath=ancestor::header')).toHaveCount(1);
  const [newChatBox, closeBox, liveBox] = await Promise.all([newChat.boundingBox(), close.boundingBox(), liveCatalog.boundingBox()]);
  expect(newChatBox && closeBox && liveBox).not.toBeNull();
  expect(closeBox!.x - (newChatBox!.x + newChatBox!.width)).toBeLessThan(newChatBox!.x - (liveBox!.x + liveBox!.width));
  await advisor.getByLabel('Votre question sur les produits').fill('Une perceuse privée pour du béton');
  await advisor.getByRole('button', { name: 'Envoyer la question' }).click();

  await expect(advisor.getByText(/option la plus proche/)).toBeVisible();
  await expect.poll(() => advisor.locator('.shopping-assistant-markdown').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect.poll(() => advisor.locator('.shopping-assistant-markdown td').first().evaluate((element) => getComputedStyle(element).borderWidth)).toBe('0px');
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
  const launcher = page.getByRole('button', { name: 'اعثر على الأداة المناسبة' });
  await expect(launcher).toBeVisible({ timeout: 10_000 });
  await launcher.click();
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
