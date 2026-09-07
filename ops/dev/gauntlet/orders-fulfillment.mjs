import assert from 'node:assert/strict';
export async function runOrdersFulfillment({ scenario, ctx, requireAdmin }) {
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
