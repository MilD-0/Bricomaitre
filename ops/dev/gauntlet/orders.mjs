import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const requireAdmin = createRequire(new URL('../../../apps/admin/package.json', import.meta.url));

export async function run(ctx) {
  let sequence = 0;
  let productId;

  const scenario = (id, title, work) =>
    ctx.test(`orders-${id}`, title, async (t) => {
      const { page, context, log, save } = t;
      await ctx.loginAdmin(page);
      const request = async (path, method = 'GET', data, accepted = [200]) => {
        const response = await context.request.fetch(`${ctx.urls.admin}${path}`, {
          method,
          data,
          headers: { origin: ctx.urls.admin },
          timeout: 60000,
        });
        const text = await response.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = { text: text.slice(0, 1000) };
        }
        log(`${method} ${path}: ${response.status()}`);
        assert.ok(
          accepted.includes(response.status()),
          `${method} ${path}: ${response.status()} ${JSON.stringify(body)}`,
        );
        return body;
      };
      const create = async (overrides = {}) => {
        if (!productId) {
          const rows = String(await ctx.query("SELECT id FROM products WHERE slug='qa-drill'"));
          productId = rows
            .split('\n')
            .find((line) => /^\d+$/.test(line.trim()))
            ?.trim();
          assert.ok(productId, 'Fixture qa-drill is required.');
        }
        sequence += 1;
        const suffix = `${ctx.runId.slice(0, 8)}-${sequence}`;
        const phone = `055${String((Date.now() + sequence) % 10000000).padStart(7, '0')}`;
        const data = {
          firstName: 'Gauntlet',
          lastName: `Order-${suffix}`,
          email: `order-${suffix}@example.invalid`,
          phoneNumber1: phone,
          cartProducts: [productId],
          delivery: 0,
          state: 16,
          city: 'Alger Centre',
          homeAddress: `12 rue QA ${suffix}`,
          ...overrides,
        };
        const response = await context.request.post(`${ctx.urls.storefront}/api/orders`, {
          data,
          headers: {
            'idempotency-key': randomUUID(),
            origin: ctx.urls.storefront,
            // Local requests model distinct customers; production's edge sets this header.
            'x-real-ip': `198.19.${Number.parseInt(ctx.runId.slice(0, 2), 16)}.${sequence}`,
          },
          timeout: 60000,
        });
        const body = await response.json();
        assert.equal(response.status(), 201, `Create synthetic order: ${JSON.stringify(body)}`);
        const order = { ...body.item, input: data };
        assert.ok(Number.isSafeInteger(Number(order.id)));
        await save(`created-${order.id}.json`, order);
        return order;
      };
      const detail = async (order) => (await request(`/api/orders/${order.id}`)).item;
      const patch = async (order, data) =>
        (await request(`/api/orders/${order.id}`, 'PATCH', data)).item;
      const searchUi = async (value) => {
        const response = page.waitForResponse((r) => {
          const url = new URL(r.url());
          return url.pathname === '/api/orders' && url.searchParams.get('search') === value;
        });
        await page.getByPlaceholder('Search customer, phone, city, or product').fill(value);
        const result = await response;
        assert.equal(result.status(), 200);
        return result.json();
      };
      const show = async (order) => {
        await page.goto(`${ctx.urls.admin}/en/orders`, { waitUntil: 'domcontentloaded' });
        await searchUi(order.input.lastName);
        await t
          .expect(page.getByText(`Gauntlet ${order.input.lastName}`, { exact: true }).first())
          .toBeVisible();
      };
      const pollJob = async (path, job) => {
        let current;
        await t.expect
          .poll(
            async () => {
              current = (
                await request(
                  `${path}${path.includes('?') ? '&' : '?'}jobId=${encodeURIComponent(job.id)}`,
                )
              ).job;
              assert.ok(!['failed', 'cancelled'].includes(current.status), JSON.stringify(current));
              return current.status;
            },
            { timeout: 120000, intervals: [1000, 2000] },
          )
          .toBe('completed');
        await save(`job-${job.id}.json`, current);
        return current;
      };
      const prepareDispatch = async (order) => {
        const item = await detail(order);
        const stateResponse = await context.request.get(`${ctx.urls.mocks}/__demo/state`);
        assert.equal(stateResponse.status(), 200);
        const state = await stateResponse.json();
        const shipment = state.shipments.find(
          (entry) => entry.tracking === item.ecotrackTrackingNumber,
        );
        assert.ok(shipment, 'Worker-created shipment must exist in the provider simulator.');
        assert.equal(shipment.reference, String(order.id));
        assert.equal(shipment.provider, 'delivro');
        const ready = { ...shipment, status: 'prete_a_expedier' };
        const changed = await context.request.post(`${ctx.urls.mocks}/__demo/shipments`, {
          data: { shipments: [ready] },
        });
        assert.equal(changed.status(), 200);
        await save('simulated-carrier-ready.json', { before: shipment, after: ready });
        log(
          `Simulator moved only ${shipment.tracking} to ready for dispatch; subsequent actions use normal admin routes.`,
        );
        const refreshed = (
          await request(`/api/orders/ecotrack/shipments/${order.id}/refresh`, 'POST')
        ).item;
        assert.equal(refreshed.status.currentStatus, 'prete_a_expedier');
        assert.equal(refreshed.canDispatch, true);
      };
      await work({
        ...t,
        request,
        create,
        detail,
        patch,
        show,
        searchUi,
        pollJob,
        prepareDispatch,
      });
    });

  await scenario(
    'handoff',
    'Customer order preserves products, delivery fee and identity in admin',
    async ({ create, detail, show, expect, page, save }) => {
      const order = await create();
      const item = await detail(order);
      await save('admin-order.json', item);
      assert.equal(item.publicToken, order.publicToken);
      assert.equal(item.fullName, `Gauntlet ${order.input.lastName}`);
      assert.equal(item.productSubtotal, 4500);
      assert.equal(item.deliveryFee, 600);
      assert.equal(item.totalAmount, 5100);
      assert.equal(item.orderProducts[0].quantity, 1);
      await show(order);
      await expect(page.getByText(`#${order.id}`, { exact: true }).first()).toBeVisible();
    },
  );

  await scenario(
    'phone-local',
    'Saving an order keeps its local phone number searchable',
    async ({ create, show, page, expect, detail, save, searchUi }) => {
      const order = await create();
      await show(order);
      await page
        .getByRole('button')
        .filter({ hasText: `Gauntlet ${order.input.lastName}` })
        .first()
        .click();
      const saveButton = page.getByRole('button', { name: 'Save changes', exact: true });
      await expect(saveButton).toBeVisible();
      await page
        .locator('form')
        .filter({ has: saveButton })
        .locator('select')
        .first()
        .selectOption('2');
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/orders/${order.id}`) &&
          response.request().method() === 'PATCH',
      );
      await saveButton.click();
      assert.equal((await saved).status(), 200);
      await expect(saveButton).toBeDisabled();
      await save('saved-order.json', await detail(order));
      const results = await searchUi(order.input.phoneNumber1);
      await save('local-phone-results.json', results);
      assert.ok(
        results.items.some((item) => item.id === Number(order.id)),
        'Saving must preserve searchability by the original phone.',
      );
      await expect(
        page.getByText(`Gauntlet ${order.input.lastName}`, { exact: true }).first(),
      ).toBeVisible();
    },
  );

  await scenario(
    'international-preservation',
    'Confirming an international-phone order preserves a valid customer number',
    async ({ create, show, page, detail, save }) => {
      const phone = `+21355${String(Date.now() % 10000000).padStart(7, '0')}`;
      const order = await create({ phoneNumber1: phone });
      await show(order);
      await page
        .getByRole('button')
        .filter({ hasText: `Gauntlet ${order.input.lastName}` })
        .first()
        .click();
      const displayed = await page.locator('input[inputmode="tel"]').inputValue();
      const saveButton = page.getByRole('button', { name: 'Save changes', exact: true });
      await page
        .locator('form')
        .filter({ has: saveButton })
        .locator('select')
        .first()
        .selectOption('2');
      const saved = page.waitForResponse(
        (r) => r.url().endsWith(`/api/orders/${order.id}`) && r.request().method() === 'PATCH',
      );
      await saveButton.click();
      assert.equal((await saved).status(), 200);
      const after = await detail(order);
      await save('international-phone.json', { original: phone, displayed, after });
      assert.equal(
        after.phoneNumber1,
        phone,
        'Changing only order status must preserve the customer international phone.',
      );
      assert.equal(displayed, phone, 'The call field must display a valid international phone.');
    },
  );

  await scenario(
    'phone-international',
    'International phone searches find orders entered in local format',
    async ({ create, show, page, expect, request, save, searchUi }) => {
      const order = await create();
      const search = `+213${order.input.phoneNumber1.slice(1)}`;
      await save(
        'search-response.json',
        await request(`/api/orders?search=${encodeURIComponent(search)}`),
      );
      await show(order);
      const results = await searchUi(search);
      assert.ok(
        results.items.some((item) => item.id === Number(order.id)),
        'International phone format must find the same customer.',
      );
      await expect(
        page.getByText(`Gauntlet ${order.input.lastName}`, { exact: true }).first(),
      ).toBeVisible();
    },
  );

  await scenario(
    'search-id',
    'An operator can find an order using its displayed reference',
    async ({ create, show, page, expect, request, save, searchUi }) => {
      const order = await create();
      await save('search-response.json', await request(`/api/orders?search=${order.id}`));
      await show(order);
      const results = await searchUi(`#${order.id}`);
      await save('reference-results.json', results);
      assert.ok(
        results.items.some((item) => item.id === Number(order.id)),
        'Displayed order reference must be searchable.',
      );
      await expect(
        page.getByText(`Gauntlet ${order.input.lastName}`, { exact: true }).first(),
      ).toBeVisible();
    },
  );

  await scenario(
    'call-history',
    'No-answer attempts, confirmation and cancellation retain accountable history',
    async ({ create, patch, detail, save }) => {
      const order = await create();
      await patch(order, { inHouseStatus: 1, noAnswerCount: 1 });
      await patch(order, { inHouseStatus: 1, noAnswerCount: 2 });
      const confirmed = await patch(order, { inHouseStatus: 2 });
      assert.ok(confirmed.confirmedBy && confirmed.confirmedAt);
      await patch(order, { inHouseStatus: 6, note: 'Customer cancelled during QA call' });
      const item = await detail(order);
      await save('history.json', item);
      assert.equal(item.inHouseStatus, 6);
      for (const status of [1, 2, 6])
        assert.ok(
          item.statusHistory.some(
            (entry) => entry.status === status && entry.changedBy && entry.changedAt,
          ),
        );
      assert.ok(
        item.statusHistory.some((entry) => entry.status === 1 && entry.noAnswerCount === 2),
      );
      assert.equal(item.totalAmount, 5100);
    },
  );

  await scenario(
    'status-filters',
    'Status and no-answer filters return the correct operational queue',
    async ({ create, patch, request, save }) => {
      const order = await create();
      await patch(order, { inHouseStatus: 1, noAnswerCount: 2 });
      const suffix = encodeURIComponent(order.input.lastName);
      const matching = await request(
        `/api/orders?search=${suffix}&inHouseStatus=1&noAnswerCountMin=2`,
      );
      const excluded = await request(`/api/orders?search=${suffix}&inHouseStatus=2`);
      await save('filters.json', { matching, excluded });
      assert.ok(matching.items.some((item) => item.id === Number(order.id)));
      assert.ok(!excluded.items.some((item) => item.id === Number(order.id)));
    },
  );

  await scenario(
    'commercial-edits',
    'Quantity and delivery edits recalculate all commercial values coherently',
    async ({ create, patch, detail, save }) => {
      const order = await create();
      const quantity = await patch(order, { cartProducts: [productId, productId] });
      assert.equal(quantity.productSubtotal, 9000);
      assert.equal(quantity.totalAmount, 9600);
      assert.equal(quantity.orderProducts[0].quantity, 2);
      const pickup = await patch(order, { delivery: 1 });
      assert.equal(pickup.totalAmount, 9000 + pickup.deliveryFee);
      const restored = await patch(order, { delivery: 0, cartProducts: [productId] });
      assert.equal(restored.totalAmount, 5100);
      await save('edited-order.json', await detail(order));
    },
  );

  await scenario(
    'preview-selection',
    'Posting preview distinguishes confirmed, unconfirmed and cancelled selections',
    async ({ create, patch, request, save }) => {
      const fresh = await create();
      const confirmed = await create();
      const cancelled = await create();
      await patch(confirmed, { inHouseStatus: 2 });
      await patch(cancelled, { inHouseStatus: 6 });
      const ids = [fresh.id, confirmed.id, cancelled.id].map(Number);
      const selected = await request('/api/orders/ecotrack/preview', 'POST', {
        mode: 'selected',
        orderIds: ids,
      });
      const batch = await request('/api/orders/ecotrack/preview', 'POST', {
        mode: 'confirmed',
        orderIds: ids,
      });
      await save('previews.json', { selected, batch });
      assert.deepEqual(
        selected.eligible.map((item) => item.orderId),
        [Number(confirmed.id)],
      );
      assert.equal(selected.invalid.length, 2);
      assert.deepEqual(
        batch.eligible.map((item) => item.orderId),
        [Number(confirmed.id)],
      );
      assert.equal(batch.totalRequested, 1);
    },
  );

  await scenario(
    'carrier-idempotence',
    'Selected carrier posting persists tracking and retry does not create another shipment',
    async ({ create, patch, request, detail, pollJob, save }) => {
      const order = await create();
      await patch(order, { inHouseStatus: 2 });
      const payload = { mode: 'selected', orderIds: [Number(order.id)], provider: 'delivro' };
      const started = await request('/api/orders/ecotrack', 'POST', payload, [201]);
      await pollJob('/api/orders/ecotrack', started.job);
      const posted = await detail(order);
      assert.equal(posted.inHouseStatus, 11);
      assert.ok(posted.ecotrackTrackingNumber);
      const repeated = await request('/api/orders/ecotrack', 'POST', payload, [201]);
      await pollJob('/api/orders/ecotrack', repeated.job);
      const after = await detail(order);
      assert.equal(after.ecotrackTrackingNumber, posted.ecotrackTrackingNumber);
      assert.equal(after.statusHistory.filter((entry) => entry.status === 11).length, 1);
      const preview = await request('/api/orders/ecotrack/preview', 'POST', payload);
      assert.equal(preview.skipped[0].reason, 'already_posted');
      const deletion = await request(`/api/orders/${order.id}`, 'DELETE', undefined, [409]);
      await save('duplicate-and-delete.json', { posted, after, preview, deletion });
    },
  );

  await scenario(
    'label-dispatch',
    'A posted order yields a PDF label and dispatch persists accountable status',
    async ({ create, patch, request, detail, pollJob, context, save, prepareDispatch }) => {
      const order = await create();
      await patch(order, { inHouseStatus: 2 });
      const started = await request(
        '/api/orders/ecotrack',
        'POST',
        { mode: 'selected', orderIds: [Number(order.id)], provider: 'delivro' },
        [201],
      );
      await pollJob('/api/orders/ecotrack', started.job);
      await prepareDispatch(order);
      const base = `/api/orders/ecotrack/shipments/${order.id}`;
      const shipment = (await request(base)).item;
      assert.ok(shipment.canPrintLabel && shipment.canDispatch);
      const label = await context.request.get(`${ctx.urls.admin}${base}/label`);
      const bytes = await label.body();
      await save('label.json', {
        status: label.status(),
        headers: label.headers(),
        byteLength: bytes.length,
        signature: bytes.subarray(0, 8).toString(),
      });
      assert.equal(label.status(), 200);
      assert.match(label.headers()['content-type'], /application\/pdf/);
      assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
      const dispatched = await request(`${base}/dispatch`, 'POST', { askCollection: false });
      const item = await detail(order);
      await save('dispatched.json', { shipment, dispatched, order: item });
      assert.equal(dispatched.item.status.currentStatus, 'en_livraison');
      assert.equal(dispatched.item.canDispatch, false);
      assert.ok(item.statusHistory.some((entry) => entry.status === 3 && entry.changedBy));
      assert.equal(item.totalAmount, 5100);
      assert.equal(item.ecotrackTrackingNumber, shipment.trackingNumber);
    },
  );

  await scenario(
    'carrier-return',
    'Return request and refresh preserve tracking and remove return eligibility',
    async ({ create, patch, request, detail, pollJob, save, prepareDispatch }) => {
      const order = await create();
      await patch(order, { inHouseStatus: 2 });
      const started = await request(
        '/api/orders/ecotrack',
        'POST',
        { mode: 'selected', orderIds: [Number(order.id)], provider: 'delivro' },
        [201],
      );
      await pollJob('/api/orders/ecotrack', started.job);
      await prepareDispatch(order);
      const base = `/api/orders/ecotrack/shipments/${order.id}`;
      const dispatched = (await request(`${base}/dispatch`, 'POST', { askCollection: false })).item;
      assert.ok(dispatched.canAskReturn);
      const returned = (await request(`${base}/return`, 'POST')).item;
      const refreshed = (await request(`${base}/refresh`, 'POST')).item;
      const item = await detail(order);
      await save('return-refresh.json', { dispatched, returned, refreshed, order: item });
      assert.equal(refreshed.status.currentStatus, 'retour_demande');
      assert.equal(refreshed.canAskReturn, false);
      assert.equal(refreshed.trackingNumber, dispatched.trackingNumber);
      assert.equal(item.ecotrackTrackingNumber, dispatched.trackingNumber);
      assert.equal(item.totalAmount, 5100);
    },
  );

  await scenario(
    'tracking-origin',
    'Admin tracking links open the matching local storefront order',
    async ({ create, show, page, expect, save }) => {
      const order = await create();
      await show(order);
      const link = page.locator(`a[href*="${order.publicToken}"]`).first();
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      await save('tracking-link.json', { href, expectedOrigin: ctx.urls.storefront });
      assert.equal(new URL(href).origin, ctx.urls.storefront);
      await page.goto(href);
      await expect(
        page.getByRole('heading', { name: 'Merci pour votre commande !' }),
      ).toBeVisible();
    },
  );

  await scenario(
    'selected-export',
    'A selected-order export contains only the chosen order and the correct amount',
    async ({ create, patch, request, pollJob, context, save }) => {
      const order = await create();
      await patch(order, { inHouseStatus: 2 });
      const started = await request(
        '/api/orders/export',
        'POST',
        { mode: 'selected', orderIds: [Number(order.id)] },
        [201, 202],
      );
      await pollJob('/api/orders/export', started.job);
      const response = await context.request.get(
        `${ctx.urls.admin}/api/orders/export/download?jobId=${encodeURIComponent(started.job.id)}`,
      );
      await save('authenticated-export.json', {
        status: response.status(),
        headers: response.headers(),
        ...(!response.ok() ? { body: await response.text() } : {}),
      });
      const anonymous = await fetch(
        `${ctx.urls.admin}/api/orders/export/download?jobId=${encodeURIComponent(started.job.id)}`,
        { redirect: 'manual' },
      );
      await save('anonymous-export.json', {
        status: anonymous.status,
        body: await anonymous.text(),
      });
      assert.equal(
        anonymous.status,
        401,
        'Private export must not be downloadable without an authenticated session.',
      );
      assert.equal(response.status(), 200);
      assert.match(response.headers()['cache-control'], /private/);
      const XLSX = requireAdmin('xlsx');
      const workbook = XLSX.read(await response.body(), { type: 'buffer' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      await save('export-rows.json', rows);
      assert.equal(rows.length, 2);
      assert.ok(rows[1].some((value) => String(value) === String(order.id)));
      assert.ok(rows[1].some((value) => Number(value) === 5100));
    },
  );

  await scenario(
    'invalid-edit',
    'Invalid edits return a useful client error without changing persisted values',
    async ({ create, detail, request, save }) => {
      const order = await create();
      const before = await detail(order);
      const invalid = await request(
        `/api/orders/${order.id}`,
        'PATCH',
        { state: 99, inHouseStatus: 999 },
        [400],
      );
      const after = await detail(order);
      await save('invalid-edit.json', { before, invalid, after });
      assert.equal(after.state, before.state);
      assert.equal(after.inHouseStatus, before.inHouseStatus);
      assert.equal(after.totalAmount, before.totalAmount);
    },
  );

  await scenario(
    'delete-draft',
    'Deleting an unposted order removes its public tracking record',
    async ({ create, request, context, save }) => {
      const order = await create();
      await request(`/api/orders/${order.id}`, 'DELETE');
      await request(`/api/orders/${order.id}`, 'GET', undefined, [404]);
      const response = await context.request.post(`${ctx.urls.storefront}/api/orders/track`, {
        data: { token: order.publicToken },
      });
      await save('deleted-public-record.json', {
        status: response.status(),
        body: await response.text(),
      });
      assert.equal(response.status(), 404);
    },
  );
}
