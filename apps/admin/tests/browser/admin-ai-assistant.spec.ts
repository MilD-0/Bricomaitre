import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

const defaultStorageState = resolve(process.cwd(), '../../ops/runtime/admin-playwright-state.json');
const storageState = process.env.ADMIN_PLAYWRIGHT_STORAGE_STATE?.trim() || defaultStorageState;

const landingPagePublicationResult = {
  message: 'Landing page 91 is now unpublished.',
  toolResults: [
    {
      type: 'tool-result',
      toolName: 'set_landing_page_active',
      output: {
        ok: true,
        id: 91,
        productId: 12,
        locale: 'fr',
        active: false,
        currentRevision: 7,
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
const ecotrackTerminalMessage = {
  role: 'assistant',
  content: 'The EcoTrack posting job finished with partial success.',
  terminal: true,
  jobId: 'ecotrack-browser-812',
  toolResults: [
    {
      type: 'tool-result',
      toolName: 'ecotrack_posting_terminal',
      output: {
        kind: 'ecotrack_posting_terminal',
        provider: 'emir',
        attemptNumber: 2,
        retryCount: 1,
        successes: [
          {
            orderId: 11,
            reference: '11',
            tracking: 'EM-BROWSER-11',
            message: 'Created successfully.',
          },
        ],
        validationFailures: [
          {
            orderId: 12,
            reference: '12',
            tracking: null,
            message: 'Commune is missing.',
          },
        ],
        providerRejections: [
          {
            orderId: 13,
            reference: '13',
            tracking: null,
            message: 'Telephone rejected.',
          },
        ],
        alreadyPosted: [
          {
            orderId: 14,
            reference: '14',
            tracking: 'EM-OLD-14',
            message: 'already_posted',
          },
        ],
        repairableOrderIds: [12, 13],
        retryableOrderIds: [13],
      },
    },
  ],
};

async function openHydratedAssistant(page: Page) {
  const launcher = page.getByRole('button', { name: 'AI assistant', exact: true });
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

test('renders a live landing-page result without desktop or mobile overflow', async ({ page }) => {
  test.setTimeout(90_000);
  const consoleErrors: string[] = [];
  const requestBodies: Record<string, unknown>[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(landingPagePublicationResult),
    });
  });

  await page.goto('/en/assets/landing-pages', {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await openHydratedAssistant(page);
  const dialog = page.getByRole('dialog');
  const workspace = dialog.locator('[data-slot="admin-ai-workspace"]');
  await page
    .getByRole('textbox', { name: 'Message the AI assistant' })
    .fill('Unpublish landing page 91 without changing its content');
  await activatePointerTarget(page, page.getByRole('button', { name: 'Send' }));

  await expect(page.getByText('Landing page 91 is now unpublished.')).toBeVisible();
  await expect(page.getByText('Landing page updated')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open landing page' })).toHaveAttribute(
    'href',
    '/en/assets/landing-pages/91',
  );
  expect(requestBodies[0]).toMatchObject({
    model: 'gpt-5.6-luna',
    context: { surface: 'assets', section: 'landingPages' },
  });
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
test('keeps a terminal EcoTrack workflow actionable across close and reload', async ({ page }) => {
  test.setTimeout(90_000);
  let postingQueued = false;
  let terminalReady = false;
  let queuedHistoryReads = 0;
  let terminalConversationReads = 0;
  const conversation = {
    id: 812,
    sessionKey: '26c2b4c2-625b-44e4-a1c2-a255d07cbf80',
    title: 'Browser EcoTrack acceptance',
  };
  await page.route('**/api/ai/conversations**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    if (path === '/api/ai/conversations/812') {
      terminalConversationReads += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversation,
          messages: [
            { role: 'user', content: 'Post exact orders 11, 12, 13 and 14 via Emir.' },
            ecotrackTerminalMessage,
          ],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ conversations: postingQueued ? [conversation] : [] }),
    });
  });
  await page.route('**/api/ai/history', async (route) => {
    if (postingQueued && !terminalReady) queuedHistoryReads += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobs: postingQueued
          ? [
              {
                id: 'ecotrack-browser-812',
                queue: 'admin-order-ecotrack',
                kind: 'order-ecotrack:selected',
                conversationId: 812,
                status: terminalReady ? 'completed' : 'running',
                progress: terminalReady
                  ? { phase: 'completed', current: 3, total: 3, percentage: 100 }
                  : { phase: 'creating', current: 1, total: 3, percentage: 33 },
                errorMessage: null,
                resultSummary: { created: 1, invalid: 1, failed: 1 },
              },
            ]
          : [],
      }),
    });
  });
  await page.route('**/api/ai/chat', async (route) => {
    postingQueued = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'The EcoTrack posting job is queued.',
        toolResults: [],
        conversation,
      }),
    });
  });

  await page.goto('/en/orders', { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await openHydratedAssistant(page);
  await page
    .getByRole('textbox', { name: 'Message the AI assistant' })
    .fill('Post exact orders 11, 12, 13 and 14 via Emir.');
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('The EcoTrack posting job is queued.')).toBeVisible();
  await expect.poll(() => queuedHistoryReads).toBeGreaterThan(0);
  const closeAssistant = page.getByRole('button', { name: 'Close AI assistant' });
  await closeAssistant.click();
  await expect(closeAssistant).toBeHidden();
  terminalReady = true;
  await expect.poll(() => terminalConversationReads, { timeout: 10_000 }).toBeGreaterThan(0);
  await openHydratedAssistant(page);
  await expect(page.getByText('Posted successfully (1)')).toBeVisible();
  await expect(page.getByText('Validation failures — not sent to the provider (1)')).toBeVisible();
  await expect(page.getByText('Provider rejections (1)')).toBeVisible();
  await expect(page.getByText('Already posted (1)')).toBeVisible();
  await expect(page.getByText(/EM-BROWSER-11/)).toBeVisible();
  await expect(page.getByText(/Commune is missing/)).toBeVisible();
  await expect(page.getByText(/Telephone rejected/)).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120_000 });
  await openHydratedAssistant(page);
  await expect(page.getByText('Posted successfully (1)')).toBeVisible();

  const composer = page.getByRole('textbox', { name: 'Message the AI assistant' });
  await page.getByRole('button', { name: 'Repair failed orders' }).click();
  await expect(composer).toHaveValue(
    'For EcoTrack order IDs 12, 13 with provider emir, load the current EcoTrack requirements and exact order evidence, then explain the concrete fixes I can approve.',
  );
  await page.getByRole('button', { name: 'Retry provider rejections' }).click();
  await expect(composer).toHaveValue(
    'Retry EcoTrack posting for the exact order IDs 13 via emir. Preview those exact IDs first and only post the eligible rows.',
  );
});
