import assert from 'node:assert/strict';
import { chromium, expect as baseExpect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { loadManifest, identity, saveJson } from './state.mjs';
import { checks, query, supervisorAlive } from './environment.mjs';

const expect = baseExpect.configure({ timeout: 30000 });
const dir = process.env.BRIC_QA_ARTIFACTS;
if (!dir) throw new Error('Run ./bric qa to retain verification evidence.');
const m = loadManifest();
assert.equal(
  identity().fingerprint,
  m.source.fingerprint,
  'Source changed: restart the environment before QA.',
);
assert.ok(supervisorAlive(m), 'Task supervisor is not running.');
assert.ok(
  (await checks(m)).every((c) => c.ok),
  'Task applications or workers are not ready.',
);
saveJson(join(dir, 'environment.json'), m);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
context.setDefaultTimeout(30000);
context.setDefaultNavigationTimeout(120000);
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
const page = await context.newPage();
const events = [];
const errors = [];
context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
page.on('pageerror', (e) => errors.push(e.message));
context.on('response', (response) => {
  if (new URL(response.url()).pathname.startsWith('/api/'))
    events.push({
      method: response.request().method(),
      url: response.url(),
      status: response.status(),
      requestId: response.headers()['x-request-id'] ?? null,
    });
});
const result = { runId: randomUUID(), steps: [] };
const step = (message) => {
  result.steps.push(message);
  console.log(message);
};
let failure;
try {
  await page.goto(`${m.urls.storefront}/fr/checkout?product=qa-drill&quantity=1`);
  await page.locator('[name="phoneNumber1"]').fill('0550000097');
  await page.locator('[name="firstName"]').fill('Agent');
  await page.locator('[name="lastName"]').fill('Verification');
  await page.locator('[name="state"]').selectOption('16');
  await page.locator('[name="city"]').selectOption('Alger Centre');
  await page.locator('[name="homeAddress"]').fill('12 rue de vérification');
  const email = `qa-${result.runId}@example.invalid`;
  await page.locator('[name="email"]').fill(email);
  let committed;
  let intercepted = false;
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() !== 'POST' || intercepted) return route.continue();
    intercepted = true;
    const response = await route.fetch({ timeout: 60000 });
    committed = {
      status: response.status(),
      body: await response.json(),
      key: route.request().headers()['idempotency-key'],
    };
    await route.abort('connectionfailed');
  });
  await page.locator('.checkout-submit').click();
  await expect(page.locator('.checkout-recovery')).toBeVisible({ timeout: 70000 });
  assert.equal(
    committed?.status,
    201,
    'The intentionally lost response must follow a committed order.',
  );
  assert.ok(committed.key, 'Checkout must send an idempotency key.');
  step('Order committed; its successful response was lost before reaching the browser.');
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/thank-you\?token=/, { timeout: 60000 });
  const token = new URL(page.url()).searchParams.get('token');
  assert.equal(token, committed.body.item.publicToken);
  const id = Number(committed.body.item.id);
  assert.ok(Number.isSafeInteger(id) && id > 0);
  result.orderId = id;
  const count = query(m, `SELECT count(*) FROM orders WHERE email='${email}'`).trim().split('\n');
  assert.ok(count.includes('1'), 'Retry must create exactly one order.');
  await page.screenshot({ path: join(dir, 'checkout-recovered.png'), fullPage: true });
  step(`Retry recovered order ${id} with the same public token and no duplicate order.`);

  const admin = await context.newPage();
  await admin.setViewportSize({ width: 1440, height: 1000 });
  await admin.goto(`${m.urls.admin}/en`);
  await admin.getByRole('button', { name: 'Enter the demo' }).click();
  await admin.waitForURL(/\/en\/administration/, { timeout: 120000 });
  const api = async (path, method = 'GET', data) => {
    const response = await context.request.fetch(`${m.urls.admin}${path}`, {
      method,
      data,
      headers: { origin: m.urls.admin },
      timeout: 60000,
    });
    const body = await response.json();
    assert.ok(response.ok(), `${method} ${path}: ${response.status()} ${JSON.stringify(body)}`);
    return body;
  };
  const initial = await api(`/api/orders/${id}`);
  assert.equal(initial.item.inHouseStatus, 0);
  const confirmed = await api(`/api/orders/${id}`, 'PATCH', { inHouseStatus: 2 });
  assert.equal(confirmed.item.inHouseStatus, 2);
  step('Authenticated admin confirmed the same customer order through the normal mutation API.');
  const started = await api('/api/orders/ecotrack', 'POST', {
    mode: 'selected',
    orderIds: [id],
    provider: 'delivro',
  });
  result.jobId = started.job.id;
  let job;
  await expect
    .poll(
      async () => {
        job = (await api(`/api/orders/ecotrack?jobId=${encodeURIComponent(result.jobId)}`)).job;
        if (['failed', 'cancelled'].includes(job.status)) throw new Error(JSON.stringify(job));
        return job.status;
      },
      { timeout: 90000, intervals: [1000, 2000] },
    )
    .toBe('completed');
  result.job = job;
  const posted = await api(`/api/orders/${id}`);
  assert.equal(posted.item.inHouseStatus, 11);
  assert.ok(posted.item.ecotrackTrackingNumber, 'Posting must persist a carrier tracking number.');
  result.tracking = posted.item.ecotrackTrackingNumber;
  saveJson(join(dir, 'order.json'), posted);
  const journal = await (await fetch(`${m.urls.mocks}/__demo/requests`)).json();
  saveJson(join(dir, 'providers.json'), journal);
  assert.ok(
    journal.requests.some((r) => r.method === 'POST' && r.status >= 200 && r.status < 300),
    'Carrier mock must receive the worker request.',
  );
  const persisted = query(
    m,
    `SELECT json_build_object('subtotal', product_subtotal, 'total', total_amount, 'status', confirmed, 'history', (SELECT json_agg(status ORDER BY changed_at) FROM order_status_history WHERE order_id=${id})) FROM orders WHERE id=${id}`,
  )
    .split('\n')
    .find((line) => line.startsWith('{'));
  const row = JSON.parse(persisted);
  assert.equal(Number(row.subtotal), 4500);
  assert.equal(Number(row.total), 5100);
  assert.equal(row.status, 11);
  assert.ok(row.history.includes(2) && row.history.includes(11));
  result.persisted = row;
  step(
    `Real worker completed job ${result.jobId}; carrier tracking ${result.tracking}, totals and history persisted.`,
  );
  await admin.goto(`${m.urls.admin}/en/orders`);
  await expect(admin.getByText('Agent Verification', { exact: true }).first()).toBeVisible();
  await admin.screenshot({ path: join(dir, 'admin-posted-order.png'), fullPage: true });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Merci pour votre commande !' })).toBeVisible();
  assert.deepEqual(errors, [], 'Browser JavaScript errors');
} catch (error) {
  failure = error;
  result.error = error.stack;
  await page.screenshot({ path: join(dir, 'failure.png'), fullPage: true }).catch(() => {});
} finally {
  saveJson(join(dir, 'journey.json'), { ...result, status: failure ? 'failed' : 'passed', errors });
  saveJson(join(dir, 'requests.json'), events);
  await context.tracing.stop({ path: join(dir, 'trace.zip') });
  await browser.close();
}
if (failure) {
  console.error(failure.stack);
  process.exitCode = 1;
}
