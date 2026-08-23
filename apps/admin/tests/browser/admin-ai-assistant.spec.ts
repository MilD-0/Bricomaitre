import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const defaultStorageState = resolve(process.cwd(), '../../ops/runtime/admin-playwright-state.json');
const storageState = process.env.ADMIN_PLAYWRIGHT_STORAGE_STATE?.trim() || defaultStorageState;

const landingPageResult = {
  message: 'The landing page draft is ready for review.',
  toolResults: [
    {
      type: 'tool-result',
      toolName: 'create_landing_page',
      output: {
        id: 91,
        productId: 12,
        locale: 'fr',
        active: false,
        currentRevision: 1,
        generation: {
          model: 'openai/gpt-5.6-luna',
          reasoning: 'A mobile-first product campaign grounded in verified catalog facts.',
          stages: {
            status: 'completed',
            plannedSections: 4,
            generatedSections: 4,
            preservedSections: 0,
            fallbackSections: 0,
            skippedSections: 0,
            retryCount: 1,
            failures: [],
          },
        },
      },
    },
  ],
  conversation: {
    id: 999,
    sessionKey: '182ffc13-33e5-43b7-a064-e4c437b0ea67',
    title: 'Browser landing-page acceptance',
  },
  messageId: null,
};

const landingPageFallbackResult = {
  ...landingPageResult,
  message: 'The landing page was saved with one explicit section fallback.',
  toolResults: [
    {
      ...landingPageResult.toolResults[0],
      output: {
        ...landingPageResult.toolResults[0].output,
        id: 92,
        generation: {
          ...landingPageResult.toolResults[0].output.generation,
          stages: {
            status: 'partial-fallback',
            plannedSections: 4,
            generatedSections: 3,
            preservedSections: 0,
            fallbackSections: 1,
            skippedSections: 1,
            retryCount: 2,
            failures: [
              {
                stage: 'block',
                type: 'image-gallery',
                reason: 'insufficient-assets',
              },
            ],
          },
        },
      },
    },
  ],
};

async function openHydratedAssistant(page: Page) {
  const launcher = page.getByRole('button', { name: 'AI assistant' });
  const close = page.getByRole('button', { name: 'Close AI assistant' });
  await launcher.waitFor({ state: 'visible', timeout: 30_000 });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await close.isVisible().catch(() => false)) {
      await page.waitForTimeout(500);
      return;
    }
    await activatePointerTarget(page, launcher, 1_000).catch(() => undefined);
    await page.waitForTimeout(250);
  }

  throw new Error('The Admin AI launcher never became interactive after hydration.');
}

async function activatePointerTarget(page: Page, locator: Locator, timeout = 5_000) {
  await expect
    .poll(
      async () => {
        return locator.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const center = {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2,
          };
          const target = document.elementFromPoint(center.x, center.y);
          return target === element || Boolean(target && element.contains(target)) ? center : null;
        });
      },
      { timeout },
    )
    .not.toBeNull();
  const center = await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  });

  await page.mouse.click(center.x, center.y);
}

test.beforeAll(() => {
  expect(
    existsSync(storageState),
    `Missing authenticated Admin browser state at ${storageState}. See apps/admin/README.md.`,
  ).toBe(true);
});

test('renders a grounded landing-page result without desktop or mobile overflow', async ({
  isMobile,
  page,
}) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const requestBodies: Record<string, unknown>[] = [];
  let requestCount = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.context().addCookies([
    {
      name: 'bric-admin-legacy-ui',
      value: '0',
      url: 'http://localhost:3000',
      sameSite: 'Lax',
    },
  ]);
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{"conversations":[]}',
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/ai/history', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"jobs":[]}' }),
  );
  await page.route('**/api/ai/chat', async (route) => {
    requestBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    const body = requestCount === 0 ? landingPageResult : landingPageFallbackResult;
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });

  await page.goto('/en/assets/landing-pages', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await openHydratedAssistant(page);
  const dialog = page.getByRole('dialog');
  const workspace = dialog.locator('[data-slot="admin-ai-workspace"]');
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(0);
  await expect
    .poll(() => workspace.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(0);
  const newChat = page.getByRole('button', { name: 'New chat' });
  if (await newChat.isVisible()) await newChat.click();
  await page
    .getByRole('textbox', { name: 'Message the AI assistant' })
    .fill('Create a landing page for product 12 in French');
  const send = page.getByRole('button', { name: 'Send' });
  await activatePointerTarget(page, send);

  await expect(page.getByText('Every planned landing-page section was generated')).toBeVisible();
  await expect(page.getByText('Generated sections')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open landing page' })).toHaveAttribute(
    'href',
    '/en/assets/landing-pages/91',
  );
  await expect(page).toHaveURL(/\/en\/assets\/landing-pages$/);
  expect(requestBodies[0]).toMatchObject({
    model: 'gpt-5.6-luna',
    context: { surface: 'assets', section: 'landingPages' },
  });

  if (isMobile) {
    await page.getByRole('button', { name: 'Your chats' }).click();
    await newChat.click();
  } else {
    await newChat.click();
  }
  const composer = page.getByRole('textbox', { name: 'Message the AI assistant' });
  await composer.fill('Create another landing page with the available product images');
  await composer.press('Enter');
  await expect(
    page.getByText('The landing page was saved with explicit section fallbacks'),
  ).toBeVisible();
  await expect(page.getByText('Sections requiring fallback')).toBeVisible();
  await expect(page.getByText('The section required more verified product assets')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open landing page' })).toHaveAttribute(
    'href',
    '/en/assets/landing-pages/92',
  );

  if (isMobile) {
    await page.getByRole('button', { name: 'Your chats' }).click();
    await expect(page.locator('[data-slot="admin-ai-sidebar"]')).toBeVisible();
    await page.getByRole('button', { name: 'Conversation' }).click();
    await expect(page.getByRole('textbox', { name: 'Message the AI assistant' })).toBeVisible();
  }

  await expect
    .poll(() => dialog.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(0);
  await expect
    .poll(() => workspace.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(0);

  const accessibility = await new AxeBuilder({ page })
    .include('[role="dialog"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
